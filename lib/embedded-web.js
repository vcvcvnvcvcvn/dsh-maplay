/**
 * Embedded web surface: serves the maplay frontend (built dist from
 * @vcvcvn/maplay) and the full HTTP API from inside this process — no maplay
 * server involved. Playground pages receive animations over SSE from the
 * default scene of the in-process {@link SceneStore}; chat pages hit the chat
 * bridge; agent tool calls are keyed per dsh session (see executor.ts).
 */
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { handleHttpMcpToolCall, handleHttpMcpTools, readPlaygroundPreviewJpg } from '@vcvcvn/maplay';
import { DEFAULT_SCENE, createSceneState } from './scene-store.js';
/** Absolute path of the maplay package (resolved via its own package.json). */
export function maplayPackageRoot() {
    return resolve(dirnameOfPackageJson());
}
/** Require-compatible resolve of the maplay package.json path. */
function dirnameOfPackageJson() {
    const resolved = new URL(import.meta.resolve('@vcvcvn/maplay/package.json'));
    return dirnameOfFileUrl(resolved);
}
function dirnameOfFileUrl(url) {
    return decodeURIComponent(url.pathname).replace(/\/package\.json$/, '');
}
function distRoot() {
    return join(maplayPackageRoot(), 'dist');
}
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
};
async function readJsonBody(req) {
    return await new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
            raw += String(chunk);
        });
        req.on('end', () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            }
            catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}
function writeJson(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}
/** Extract the `scene` query param (isolated scene key) from a request URL. */
function sceneFromUrl(raw) {
    const url = new URL(raw ?? '/', 'http://x');
    const scene = url.searchParams.get('scene');
    return scene !== null && scene.length > 0 ? scene : DEFAULT_SCENE;
}
/** Serve one static file from the maplay dist root. */
async function serveStaticFile(pathname, res, htmlInject) {
    const root = resolve(distRoot());
    const target = resolve(normalize(join(root, pathname)));
    if (target !== root && !target.startsWith(root + sep)) {
        writeJson(res, 403, { ok: false, error: 'forbidden' });
        return;
    }
    try {
        let body = await readFile(target);
        const type = MIME[extname(target)] ?? 'application/octet-stream';
        const inject = typeof htmlInject === 'function' ? htmlInject() : htmlInject;
        if (inject !== undefined && type.startsWith('text/html')) {
            let text = body.toString('utf8');
            text = text.includes('</head>')
                ? text.replace('</head>', `${inject}</head>`)
                : text + inject;
            body = Buffer.from(text, 'utf8');
        }
        res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': String(body.byteLength),
        });
        res.end(body);
    }
    catch {
        writeJson(res, 404, { ok: false, error: `not found: ${pathname}` });
    }
}
/**
 * Register the embedded maplay routes on ctx.webServer, backed by the
 * per-session {@link SceneStore} (web/HTTP traffic uses the default scene).
 * Returns the disposer; route registrations are plain map entries, so the
 * disposer must be returned from a ctx.effect body.
 */
export function serveMaplayEmbedded(webServer, store, options) {
    const path = options.path;
    const disposers = [];
    // Landing: / -> /maplay/chat (when rootToChat) and /maplay -> /maplay/chat.
    if (options.rootToChat !== false) {
        disposers.push(webServer.register({
            kind: 'exact',
            path: '/',
            handler: (req, res) => {
                res.statusCode = 302;
                res.setHeader('Location', `${path}/chat`);
                res.end();
            },
        }));
    }
    const redirectToHtml = (html) => {
        disposers.push(webServer.register({
            kind: 'exact',
            path: html === 'chat' ? `${path}/chat` : `${path}/${html}`,
            handler: (req, res) => {
                const raw = req.url ?? '';
                const search = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
                res.statusCode = 302;
                res.setHeader('Location', `${path}/${html}.html${search}`);
                res.end();
            },
        }));
    };
    redirectToHtml('chat');
    redirectToHtml('playground');
    redirectToHtml('map-editor');
    // Chat bridge.
    if (options.chatHandler !== undefined) {
        disposers.push(webServer.register({
            kind: 'exact',
            path: '/api/chat',
            handler: options.chatHandler,
        }));
    }
    // maplay HTTP API, all in-process, default scene.
    disposers.push(webServer.register({
        kind: 'exact',
        path: '/api/board',
        handler: (req, res) => writeJson(res, 200, store.board(sceneFromUrl(req.url))),
    }));
    disposers.push(webServer.register({
        kind: 'exact',
        path: '/api/tools/list',
        handler: async (_req, res) => {
            const { handleHttpToolList } = await import('@vcvcvn/maplay');
            writeJson(res, 200, await handleHttpToolList());
        },
    }));
    disposers.push(webServer.register({
        kind: 'exact',
        path: '/api/tools/call',
        handler: async (req, res) => {
            try {
                const payload = await readJsonBody(req);
                if (typeof payload.tool !== 'string') {
                    writeJson(res, 400, { ok: false, error: 'missing tool' });
                    return;
                }
                const result = await store.executeTool(sceneFromUrl(req.url), payload.tool, payload.args ?? {});
                writeJson(res, 200, result);
            }
            catch (error) {
                writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
            }
        },
    }));
    disposers.push(webServer.register({
        kind: 'exact',
        path: '/api/playground/session',
        handler: async (req, res) => {
            const scene = sceneFromUrl(req.url);
            if (req.method === 'GET') {
                writeJson(res, 200, store.get(scene));
                return;
            }
            if (req.method === 'POST') {
                try {
                    const payload = await readJsonBody(req);
                    if (payload.map === undefined) {
                        writeJson(res, 400, { error: 'missing map' });
                        return;
                    }
                    writeJson(res, 200, store.set(scene, createSceneState(payload.map)));
                }
                catch (error) {
                    writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
                }
                return;
            }
            writeJson(res, 405, { error: 'method not allowed' });
        },
    }));
    disposers.push(webServer.register({
        kind: 'exact',
        path: '/api/playground/session/action-complete',
        handler: async (req, res) => {
            try {
                const payload = await readJsonBody(req);
                if (typeof payload.requestId !== 'string' || payload.requestId.length === 0) {
                    writeJson(res, 400, { ok: false, error: 'requestId 不能为空' });
                    return;
                }
                const ok = store.acknowledgeAction(sceneFromUrl(req.url), payload.requestId);
                writeJson(res, ok ? 200 : 404, ok ? { ok: true } : { ok: false, error: '当前没有可用 session' });
            }
            catch (error) {
                writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
        },
    }));
    disposers.push(webServer.register({
        kind: 'exact',
        path: '/api/playground/session/events',
        handler: (req, res) => {
            const scene = sceneFromUrl(req.url);
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });
            const snapshot = store.get(scene);
            res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
            const unsubscribe = store.subscribe(scene, (_key, state) => {
                res.write(`data: ${JSON.stringify(state)}\n\n`);
            });
            req.on('close', () => {
                unsubscribe();
            });
        },
    }));
    disposers.push(webServer.register({
        kind: 'exact',
        path: '/api/playground/export/jpg',
        handler: (_req, res) => {
            const scene = store.has(DEFAULT_SCENE) ? store.get(DEFAULT_SCENE) : null;
            const result = readPlaygroundPreviewJpg(scene === null ? null : { map: scene.map, messages: [], actionRequest: null, actionQueue: scene.actionQueue, previewJpgDataUrl: null, updatedAt: scene.updatedAt });
            writeJson(res, result.ok ? 200 : 404, result);
        },
    }));
    disposers.push(webServer.register({
        kind: 'exact',
        path: '/api/mcp/tools',
        handler: async (req, res) => {
            const payload = req.method === 'POST' ? await readJsonBody(req) : {};
            writeJson(res, 200, await handleHttpMcpTools(payload));
        },
    }));
    disposers.push(webServer.register({
        kind: 'exact',
        path: '/api/mcp/call',
        handler: async (req, res) => {
            const payload = await readJsonBody(req);
            const result = await store.executeTool(sceneFromUrl(req.url), payload.name ?? '', payload.args ?? {});
            writeJson(res, 200, { ok: result.ok, content: result.summary });
        },
    }));
    // Static frontend + /demo.json under the mount prefix.
    disposers.push(webServer.register({
        kind: 'prefix',
        path,
        handler: async (req, res) => {
            const raw = req.url ?? '/';
            const url = new URL(raw, 'http://x');
            let pathname = url.pathname;
            if (pathname.startsWith(`${path}/`))
                pathname = pathname.slice(path.length);
            if (pathname === '/' || pathname === '') {
                res.statusCode = 302;
                res.setHeader('Location', `${path}/chat`);
                res.end();
                return;
            }
            await serveStaticFile(pathname, res, options.htmlInject);
        },
    }));
    // Root-level /demo.json for the chat page's fetch('/demo.json').
    disposers.push(webServer.register({
        kind: 'exact',
        path: '/demo.json',
        handler: async (_req, res) => serveStaticFile('/demo.json', res),
    }));
    return () => {
        for (const dispose of disposers.splice(0).reverse())
            dispose();
    };
}
//# sourceMappingURL=embedded-web.js.map