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
import { DEFAULT_SCENE, SceneStore } from './scene-store.js';
/** Execute tools inside this process using maplay's real executor + per-session scenes. */
export class EmbeddedExecutor {
    tools;
    store;
    constructor(initialMap, tools) {
        this.tools = tools;
        this.store = new SceneStore(initialMap);
    }
    /** The store backing this executor (web channel + SSE use the default scene). */
    get scenes() {
        return this.store;
    }
    async call(name, args, _signal, sessionId) {
        if (this.tools !== undefined && !this.tools.includes(name)) {
            return { ok: false, summary: `tool ${name} is not enabled`, error: `tool ${name} is not enabled` };
        }
        const key = sessionId ?? DEFAULT_SCENE;
        return await this.store.executeTool(key, name, args ?? {});
    }
}
/** Bridge to an externally running maplay server over its HTTP API. */
export class HttpExecutor {
    client;
    constructor(client) {
        this.client = client;
    }
    async call(name, args, signal) {
        return await this.client.call(name, args, signal);
    }
}
//# sourceMappingURL=executor.js.map