/**
 * Optional maplay embedding on `ctx.webServer`, so the live playground becomes
 * a page of the dsh Web UI (e.g. http://127.0.0.1:3080/maplay/playground).
 *
 * maplay's frontend uses root-relative paths (`/api/...`, `/src/...`), so a
 * bare prefix proxy would break it. This module registers two kinds of routes:
 *
 *  - a `/maplay` prefix route that strips the prefix and forwards everything
 *    else (HTML, JS/CSS modules, assets) to the maplay origin;
 *  - exact routes at the dsh root for maplay's HTTP API paths (`/api/board`,
 *    `/api/tools/*`, `/api/playground/*`, `/api/chat`, ...), because the page
 *    fetches them root-relative and exact routes win over dsh's own `/api`
 *    prefix route.
 *
 * The Vite HMR websocket is intentionally not proxied; the page runs fine
 * without live-reload.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/** maplay API paths registered as exact root routes so the embedded page's root-relative fetches reach maplay. */
export declare const MAPLAY_API_PATHS: readonly ["/api/board", "/api/tools/list", "/api/tools/call", "/api/playground/session", "/api/playground/session/action-complete", "/api/playground/session/events", "/api/playground/export/jpg", "/api/mcp/tools", "/api/mcp/call"];
/** Static assets maplay serves at the root that the embedded frontends load directly. */
export declare const MAPLAY_ROOT_PATHS: readonly ["/demo.json"];
export interface RegisterMaplayProxyOptions {
    /** Path prefix registered on ctx.webServer, e.g. `/maplay`. */
    path?: string;
    /** Upstream maplay origin, e.g. http://127.0.0.1:8992 */
    baseUrl: string;
    /**
     * Strip the mount prefix when forwarding. True for an externally started
     * maplay (vite emits root-relative URLs); false when the plugin spawned
     * maplay with `--base=<path>/` (vite already emits prefixed URLs).
     */
    stripPrefix?: boolean;
    /**
     * Register an exact `/` route that redirects to `<path>/chat`, turning the
     * maplay chat page into the dsh frontend landing page.
     */
    rootToChat?: boolean;
    /**
     * When set, an exact `/api/chat` route is registered with this handler
     * instead of proxying to maplay (the plugin's own chat bridge).
     */
    chatHandler?: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    /**
     * Optional per-response HTML injection for proxied pages; receives the
     * upstream pathname and may return a snippet (or undefined to skip). Used
     * to flip the maplay chat page into dsh mode.
     */
    htmlInject?: (pathname: string) => string | undefined;
}
/**
 * Proxy one HTTP request to the upstream maplay origin.
 * @param stripPrefix - when set, this prefix is removed from the forwarded pathname
 *   (mount-prefixed requests to a root-relative upstream).
 * @param prependPrefix - when set, this prefix is added to the forwarded pathname
 *   (root-relative requests to a base-prefixed upstream, e.g. vite `--base`).
 * @param htmlInject - optional per-response HTML snippet injected before `</head>`
 *   for matching HTML pages (e.g. to activate the frontend's dsh mode).
 */
export declare function proxyToMaplay(baseUrl: string, req: IncomingMessage, res: ServerResponse, stripPrefix?: string, prependPrefix?: string, htmlInject?: (pathname: string) => string | undefined): void;
/**
 * Register the routes. Returns a disposer; `ctx.webServer` route registrations
 * are NOT effect-scoped automatically (the route tables are plain maps), so
 * the disposer must be returned from a `ctx.effect` body.
 */
export declare function registerMaplayProxy(webServer: {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>;
    }): () => void;
}, options: RegisterMaplayProxyOptions): () => void;
//# sourceMappingURL=proxy.d.ts.map