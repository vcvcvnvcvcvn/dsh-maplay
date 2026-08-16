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
import { request as httpRequest } from 'node:http';
/** maplay API paths registered as exact root routes so the embedded page's root-relative fetches reach maplay. */
export const MAPLAY_API_PATHS = [
    '/api/board',
    '/api/tools/list',
    '/api/tools/call',
    '/api/chat',
    '/api/playground/session',
    '/api/playground/session/action-complete',
    '/api/playground/session/events',
    '/api/playground/export/jpg',
    '/api/mcp/tools',
    '/api/mcp/call',
];
/**
 * Proxy one HTTP request to the upstream maplay origin. When `stripPrefix` is
 * set, the given prefix is removed from the forwarded pathname.
 */
export function proxyToMaplay(baseUrl, req, res, stripPrefix) {
    const upstream = new URL(baseUrl);
    const raw = req.url ?? '/';
    const url = new URL(raw, upstream.origin);
    if (stripPrefix !== undefined && url.pathname.startsWith(`${stripPrefix}/`)) {
        url.pathname = url.pathname.slice(stripPrefix.length);
    }
    const headers = { ...req.headers };
    delete headers.host;
    headers.host = upstream.host;
    const upstreamReq = httpRequest({
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port || undefined,
        method: req.method,
        path: `${url.pathname}${url.search}`,
        headers,
    }, (upstreamRes) => {
        const status = upstreamRes.statusCode ?? 502;
        // Rewrite root-relative redirect targets so the browser stays inside the
        // /maplay mount (maplay redirects /playground -> /playground.html).
        const headers = { ...upstreamRes.headers };
        if (status >= 300 && status < 400) {
            const location = headers.location;
            if (typeof location === 'string' && location.startsWith('/')) {
                headers.location = `${stripPrefix ?? ''}${location}`;
            }
        }
        res.writeHead(status, headers);
        upstreamRes.pipe(res);
    });
    upstreamReq.on('error', (error) => {
        if (res.headersSent) {
            res.destroy(error);
        }
        else {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: `maplay proxy error: ${error.message}` }));
        }
    });
    req.pipe(upstreamReq);
}
/**
 * Register the routes. Returns a disposer; `ctx.webServer` route registrations
 * are NOT effect-scoped automatically (the route tables are plain maps), so
 * the disposer must be returned from a `ctx.effect` body.
 */
export function registerMaplayProxy(webServer, options) {
    const path = options.path ?? '/maplay';
    const upstream = options.baseUrl.replace(/\/+$/, '');
    const stripPrefix = options.stripPrefix !== false ? path : undefined;
    const disposers = [];
    disposers.push(webServer.register({
        kind: 'prefix',
        path,
        handler(req, res) {
            // /maplay -> /maplay/playground so the playground is the landing page.
            const raw = req.url ?? '/';
            const pathname = raw.split('?')[0] ?? '/';
            if (pathname === path || pathname === `${path}/`) {
                const search = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
                res.statusCode = 302;
                res.setHeader('Location', `${path}/playground${search}`);
                res.end();
                return;
            }
            proxyToMaplay(upstream, req, res, stripPrefix);
        },
    }));
    // Exact root routes for maplay's root-relative API calls.
    for (const apiPath of MAPLAY_API_PATHS) {
        disposers.push(webServer.register({
            kind: 'exact',
            path: apiPath,
            handler: (req, res) => proxyToMaplay(upstream, req, res),
        }));
    }
    return () => {
        for (const dispose of disposers.splice(0).reverse())
            dispose();
    };
}
//# sourceMappingURL=proxy.js.map