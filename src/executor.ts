/**
 * Tool execution backends.
 *
 *  - `EmbeddedExecutor` runs maplay's real tool executor inside this process
 *    (bundled from @vcvcvn/maplay), keyed per dsh session: each agent session
 *    owns its own map scene via {@link SceneStore}. No maplay server, no HTTP
 *    round trip.
 *  - `HttpExecutor` keeps the original bridge mode for deployments that run
 *    maplay as an external service (baseUrl + optional spawn).
 */

import type { MaplayClient, MaplayToolResult } from './client.js'
import { DEFAULT_SCENE, SceneStore } from './scene-store.js'

/** Uniform tool-call surface consumed by the registered dsh tools. */
export interface ToolExecutor {
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal, sessionId?: string): Promise<MaplayToolResult>
}

/** Execute tools inside this process using maplay's real executor + per-session scenes. */
export class EmbeddedExecutor implements ToolExecutor {
  private readonly store: SceneStore

  constructor(
    initialMap: unknown,
    private readonly tools: string[] | undefined,
  ) {
    this.store = new SceneStore(initialMap)
  }

  /** The store backing this executor (web channel + SSE use the default scene). */
  get scenes(): SceneStore {
    return this.store
  }

  async call(name: string, args: Record<string, unknown>, _signal?: AbortSignal, sessionId?: string): Promise<MaplayToolResult> {
    if (this.tools !== undefined && !this.tools.includes(name)) {
      return { ok: false, summary: `tool ${name} is not enabled`, error: `tool ${name} is not enabled` }
    }
    const key = sessionId ?? DEFAULT_SCENE
    return await this.store.executeTool(key, name, args ?? {})
  }
}

/** Bridge to an externally running maplay server over its HTTP API. */
export class HttpExecutor implements ToolExecutor {
  constructor(private readonly client: MaplayClient) {}

  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<MaplayToolResult> {
    return await this.client.call(name, args, signal)
  }
}
