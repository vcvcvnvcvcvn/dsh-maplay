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
import type { MaplayClient, MaplayToolResult } from './client.js';
import { SceneStore } from './scene-store.js';
/** Uniform tool-call surface consumed by the registered dsh tools. */
export interface ToolExecutor {
    call(name: string, args: Record<string, unknown>, signal?: AbortSignal, sessionId?: string): Promise<MaplayToolResult>;
}
/** Execute tools inside this process using maplay's real executor + per-session scenes. */
export declare class EmbeddedExecutor implements ToolExecutor {
    private readonly tools;
    private readonly store;
    constructor(initialMap: unknown, tools: string[] | undefined);
    /** The store backing this executor (web channel + SSE use the default scene). */
    get scenes(): SceneStore;
    call(name: string, args: Record<string, unknown>, _signal?: AbortSignal, sessionId?: string): Promise<MaplayToolResult>;
}
/** Bridge to an externally running maplay server over its HTTP API. */
export declare class HttpExecutor implements ToolExecutor {
    private readonly client;
    constructor(client: MaplayClient);
    call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<MaplayToolResult>;
}
//# sourceMappingURL=executor.d.ts.map