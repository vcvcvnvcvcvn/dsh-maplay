/**
 * Per-session scene storage: every dsh session (agent conversation) owns its
 * own map state — map document, animation queue, and chat transcript — so two
 * sessions driving maplay never see each other's moves.
 *
 * The HTTP/web channel (playground page, curl) uses the reserved `default`
 * key; agent tool calls use the calling agent's sessionId. Tool execution is
 * the same pure maplay logic as before, just keyed per scene instead of one
 * process-wide singleton.
 */

import {
  applyHighLevelDefinitionToMap,
  createBoardInfo,
  createRequestId,
  executePlaygroundTool,
  sanitizeMapDocument,
  type HighLevelDefinition,
  type MapDocument,
  type OssConversationMessage,
  type PlaygroundToolResult,
} from '@vcvcvn/maplay'

/** The reserved scene key for non-agent callers (web pages, HTTP, curl). */
export const DEFAULT_SCENE = 'default'

/** One isolated scene: map + pending animations + transcript. */
export interface SceneState {
  map: MapDocument
  messages: OssConversationMessage[]
  actionQueue: Array<{ nonce: number; requestId: string; action: HighLevelDefinition }>
  updatedAt: number
}

export interface SceneToolResult {
  ok: boolean
  summary: string
  applied?: unknown
  board?: unknown
  error?: string
  [key: string]: unknown
}

type SceneSubscriber = (sceneKey: string, state: SceneState) => void

/** Load a raw map document into a fresh scene state. */
export function createSceneState(map: unknown): SceneState {
  return {
    map: sanitizeMapDocument(map as Parameters<typeof sanitizeMapDocument>[0]),
    messages: [],
    actionQueue: [],
    updatedAt: Date.now(),
  }
}

/**
 * In-process per-session scene store. Also owns the notification fan-out used
 * by the /api/playground/session/events SSE stream.
 */
export class SceneStore {
  private scenes = new Map<string, SceneState>()
  private readonly initialMap: unknown
  private subscribers = new Map<string, Set<SceneSubscriber>>()

  constructor(initialMap: unknown) {
    this.initialMap = initialMap
  }

  /** The scene for a key, created lazily from the initial map on first touch. */
  get(key: string): SceneState {
    let scene = this.scenes.get(key)
    if (scene === undefined) {
      scene = createSceneState(this.initialMap)
      this.scenes.set(key, scene)
    }
    return scene
  }

  /** Replace a scene entirely (e.g. map upload via HTTP). */
  set(key: string, state: SceneState): SceneState {
    this.scenes.set(key, state)
    this.notify(key, state)
    return state
  }

  /** True when the key has been touched at least once. */
  has(key: string): boolean {
    return this.scenes.has(key)
  }

  /** Drop a scene (session teardown); no-op when absent. */
  delete(key: string): void {
    if (this.scenes.delete(key)) {
      this.subscribers.get(key)?.forEach((cb) => cb(key, { map: createSceneState(this.initialMap).map, messages: [], actionQueue: [], updatedAt: Date.now() }))
    }
  }

  /** Execute one maplay tool against a scene, mutating its map/queue/transcript. */
  async executeTool(key: string, toolName: string, args: Record<string, unknown>): Promise<SceneToolResult> {
    const scene = this.get(key)
    const result = executePlaygroundTool(toolName, args, scene.map) as PlaygroundToolResult & { board?: unknown }

    scene.messages = [
      ...scene.messages,
      {
        id: `tool-${Date.now()}`,
        role: 'tool',
        toolName,
        result: { ok: result.ok, summary: result.summary, ...(result.error ? { error: result.error } : {}) },
        ok: result.ok,
      },
    ]

    if (result.ok && result.applied && typeof result.applied === 'object' && result.applied !== null) {
      scene.actionQueue = [
        ...scene.actionQueue,
        {
          nonce: Math.max(Date.now(), ...scene.actionQueue.map((item) => item.nonce)) + 1,
          requestId: createRequestId('dsh'),
          action: result.applied as HighLevelDefinition,
        },
      ]
      scene.map = applyHighLevelDefinitionToMap(scene.map, result.applied as HighLevelDefinition)
    }
    scene.updatedAt = Date.now()
    this.notify(key, scene)

    return {
      ok: result.ok,
      summary: result.summary ?? '',
      ...(result.applied !== undefined ? { applied: result.applied } : {}),
      ...(result.board !== undefined ? { board: result.board } : {}),
      ...(result.error !== undefined ? { error: result.error } : {}),
    }
  }

  /** Acknowledge the head of a scene's animation queue (playground playback). */
  acknowledgeAction(key: string, requestId: string): boolean {
    const scene = this.scenes.get(key)
    if (scene === undefined) return false
    const index = scene.actionQueue.findIndex((item) => item.requestId === requestId)
    if (index === -1) return false
    scene.actionQueue = scene.actionQueue.filter((_, i) => i !== index)
    scene.updatedAt = Date.now()
    this.notify(key, scene)
    return true
  }

  /** Board snapshot for one scene. */
  board(key: string): { ok: boolean; board?: unknown; error?: string } {
    if (!this.scenes.has(key)) return { ok: false, error: '当前没有可用地图' }
    return { ok: true, board: createBoardInfo(this.scenes.get(key)!.map) }
  }

  /** Subscribe to state changes for one scene; returns the unsubscribe. */
  subscribe(key: string, callback: SceneSubscriber): () => void {
    let set = this.subscribers.get(key)
    if (set === undefined) {
      set = new Set()
      this.subscribers.set(key, set)
    }
    set.add(callback)
    return () => {
      set?.delete(callback)
    }
  }

  private notify(key: string, state: SceneState): void {
    this.subscribers.get(key)?.forEach((cb) => cb(key, state))
  }
}
