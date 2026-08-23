/**
 * Embedded web surface: serves the maplay frontend (built dist from
 * @vcvcvn/maplay) and the full HTTP API from inside this process — no maplay
 * server involved. Playground pages receive animations over SSE from the
 * default scene of the in-process {@link SceneStore}; chat pages hit the chat
 * bridge; agent tool calls are keyed per dsh session (see executor.ts).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type SceneStore } from './scene-store.js';
/** Absolute path of the maplay package (resolved via its own package.json). */
export declare function maplayPackageRoot(): string;
export interface ServeEmbeddedOptions {
    /** Route prefix, e.g. /maplay. */
    path: string;
    /** Redirect `/` to `<path>/chat` (maplay chat as the dsh frontend). Defaults to true. */
    rootToChat?: boolean;
    /** Optional POST /api/chat handler (chat bridge). */
    chatHandler?: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    /** Optional HTML snippet (or provider) injected into every served HTML page. */
    htmlInject?: string | (() => string | undefined);
}
/**
 * Register the embedded maplay routes on ctx.webServer, backed by the
 * per-session {@link SceneStore} (web/HTTP traffic uses the default scene).
 * Returns the disposer; route registrations are plain map entries, so the
 * disposer must be returned from a ctx.effect body.
 */
export declare function serveMaplayEmbedded(webServer: {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>;
    }): () => void;
}, store: SceneStore, options: ServeEmbeddedOptions): () => void;
//# sourceMappingURL=embedded-web.d.ts.map