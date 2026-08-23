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
import { applyHighLevelDefinitionToMap, createBoardInfo, createRequestId, executePlaygroundTool, sanitizeMapDocument, } from '@vcvcvn/maplay';
/** The reserved scene key for non-agent callers (web pages, HTTP, curl). */
export const DEFAULT_SCENE = 'default';
/** Load a raw map document into a fresh scene state. */
export function createSceneState(map) {
    return {
        map: sanitizeMapDocument(map),
        messages: [],
        actionQueue: [],
        updatedAt: Date.now(),
    };
}
/**
 * In-process per-session scene store. Also owns the notification fan-out used
 * by the /api/playground/session/events SSE stream.
 */
export class SceneStore {
    scenes = new Map();
    initialMap;
    subscribers = new Map();
    constructor(initialMap) {
        this.initialMap = initialMap;
    }
    /** The scene for a key, created lazily from the initial map on first touch. */
    get(key) {
        let scene = this.scenes.get(key);
        if (scene === undefined) {
            scene = createSceneState(this.initialMap);
            this.scenes.set(key, scene);
        }
        return scene;
    }
    /** Replace a scene entirely (e.g. map upload via HTTP). */
    set(key, state) {
        this.scenes.set(key, state);
        this.notify(key, state);
        return state;
    }
    /** True when the key has been touched at least once. */
    has(key) {
        return this.scenes.has(key);
    }
    /** Drop a scene (session teardown); no-op when absent. */
    delete(key) {
        if (this.scenes.delete(key)) {
            this.subscribers.get(key)?.forEach((cb) => cb(key, { map: createSceneState(this.initialMap).map, messages: [], actionQueue: [], updatedAt: Date.now() }));
        }
    }
    /** Execute one maplay tool against a scene, mutating its map/queue/transcript. */
    async executeTool(key, toolName, args) {
        const scene = this.get(key);
        const result = executePlaygroundTool(toolName, args, scene.map);
        scene.messages = [
            ...scene.messages,
            {
                id: `tool-${Date.now()}`,
                role: 'tool',
                toolName,
                result: { ok: result.ok, summary: result.summary, ...(result.error ? { error: result.error } : {}) },
                ok: result.ok,
            },
        ];
        if (result.ok && result.applied && typeof result.applied === 'object' && result.applied !== null) {
            scene.actionQueue = [
                ...scene.actionQueue,
                {
                    nonce: Math.max(Date.now(), ...scene.actionQueue.map((item) => item.nonce)) + 1,
                    requestId: createRequestId('dsh'),
                    action: result.applied,
                },
            ];
            scene.map = applyHighLevelDefinitionToMap(scene.map, result.applied);
        }
        scene.updatedAt = Date.now();
        this.notify(key, scene);
        return {
            ok: result.ok,
            summary: result.summary ?? '',
            ...(result.applied !== undefined ? { applied: result.applied } : {}),
            ...(result.board !== undefined ? { board: result.board } : {}),
            ...(result.error !== undefined ? { error: result.error } : {}),
        };
    }
    /** Acknowledge the head of a scene's animation queue (playground playback). */
    acknowledgeAction(key, requestId) {
        const scene = this.scenes.get(key);
        if (scene === undefined)
            return false;
        const index = scene.actionQueue.findIndex((item) => item.requestId === requestId);
        if (index === -1)
            return false;
        scene.actionQueue = scene.actionQueue.filter((_, i) => i !== index);
        scene.updatedAt = Date.now();
        this.notify(key, scene);
        return true;
    }
    /** Board snapshot for one scene (lazily initializes it from the seed map). */
    board(key) {
        return { ok: true, board: createBoardInfo(this.get(key).map) };
    }
    /** Subscribe to state changes for one scene; returns the unsubscribe. */
    subscribe(key, callback) {
        let set = this.subscribers.get(key);
        if (set === undefined) {
            set = new Set();
            this.subscribers.set(key, set);
        }
        set.add(callback);
        return () => {
            set?.delete(callback);
        };
    }
    notify(key, state) {
        this.subscribers.get(key)?.forEach((cb) => cb(key, state));
    }
}
//# sourceMappingURL=scene-store.js.map