/**
 * Embedded web surface: serves the maplay frontend (built dist from
 * @vcvcvn/maplay) and the full HTTP API from inside this process — no maplay
 * server involved. Playground pages receive animations over SSE from the
 * default scene of the in-process {@link SceneStore}; chat pages hit the chat
 * bridge; agent tool calls are keyed per dsh session (see executor.ts).
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { handleHttpMcpToolCall, handleHttpMcpTools, readPlaygroundPreviewJpg } from '@vcvcvn/maplay'
import { DEFAULT_SCENE, createSceneState, type SceneStore } from './scene-store.js'

/** Absolute path of the maplay package (resolved via its own package.json). */
export function maplayPackageRoot(): string {
  return resolve(dirnameOfPackageJson())
}

/** Require-compatible resolve of the maplay package.json path. */
function dirnameOfPackageJson(): string {
  const resolved = new URL(import.meta.resolve('@vcvcvn/maplay/package.json'))
  return dirnameOfFileUrl(resolved)
}

function dirnameOfFileUrl(url: URL): string {
  return decodeURIComponent(url.pathname).replace(/\/package\.json$/, '')
}

function distRoot(): string {
  return join(maplayPackageRoot(), 'dist')
}

const MIME: Record<string, string> = {
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
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += String(chunk)
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) as unknown : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

/** Serve one static file from the maplay dist root. */
async function serveStaticFile(
  pathname: string,
  res: ServerResponse,
  htmlInject?: string | (() => string | undefined),
): Promise<void> {
  const root = resolve(distRoot())
  const target = resolve(normalize(join(root, pathname)))
  if (target !== root && !target.startsWith(root + sep)) {
    writeJson(res, 403, { ok: false, error: 'forbidden' })
    return
  }
  try {
    let body = await readFile(target)
    const type = MIME[extname(target)] ?? 'application/octet-stream'
    const inject = typeof htmlInject === 'function' ? htmlInject() : htmlInject
    if (inject !== undefined && type.startsWith('text/html')) {
      let text = body.toString('utf8')
      text = text.includes('</head>')
        ? text.replace('</head>', `${inject}</head>`)
        : text + inject
      body = Buffer.from(text, 'utf8')
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': String(body.byteLength),
    })
    res.end(body)
  } catch {
    writeJson(res, 404, { ok: false, error: `not found: ${pathname}` })
  }
}

export interface ServeEmbeddedOptions {
  /** Route prefix, e.g. /maplay. */
  path: string
  /** Redirect `/` to `<path>/chat` (maplay chat as the dsh frontend). Defaults to true. */
  rootToChat?: boolean
  /** Optional POST /api/chat handler (chat bridge). */
  chatHandler?: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  /** Optional HTML snippet (or provider) injected into every served HTML page. */
  htmlInject?: string | (() => string | undefined)
}

/**
 * Register the embedded maplay routes on ctx.webServer, backed by the
 * per-session {@link SceneStore} (web/HTTP traffic uses the default scene).
 * Returns the disposer; route registrations are plain map entries, so the
 * disposer must be returned from a ctx.effect body.
 */
export function serveMaplayEmbedded(
  webServer: {
    register(route: {
      kind: 'exact' | 'prefix'
      path: string
      handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>
    }): () => void
  },
  store: SceneStore,
  options: ServeEmbeddedOptions,
): () => void {
  const path = options.path
  const disposers: Array<() => void> = []

  // Landing: / -> /maplay/chat (when rootToChat) and /maplay -> /maplay/chat.
  if (options.rootToChat !== false) {
    disposers.push(webServer.register({
      kind: 'exact',
      path: '/',
      handler: (req, res) => {
        res.statusCode = 302
        res.setHeader('Location', `${path}/chat`)
        res.end()
      },
    }))
  }

  const redirectToHtml = (html: string): void => {
    disposers.push(webServer.register({
      kind: 'exact',
      path: html === 'chat' ? `${path}/chat` : `${path}/${html}`,
      handler: (req, res) => {
        res.statusCode = 302
        res.setHeader('Location', `${path}/${html}.html`)
        res.end()
      },
    }))
  }
  redirectToHtml('chat')
  redirectToHtml('playground')
  redirectToHtml('map-editor')

  // Chat bridge.
  if (options.chatHandler !== undefined) {
    disposers.push(webServer.register({
      kind: 'exact',
      path: '/api/chat',
      handler: options.chatHandler,
    }))
  }

  // maplay HTTP API, all in-process, default scene.
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/api/board',
    handler: (_req, res) => writeJson(res, 200, store.board(DEFAULT_SCENE)),
  }))
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/api/tools/list',
    handler: async (_req, res) => {
      const { handleHttpToolList } = await import('@vcvcvn/maplay')
      writeJson(res, 200, await handleHttpToolList())
    },
  }))
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/api/tools/call',
    handler: async (req, res) => {
      try {
        const payload = await readJsonBody(req) as { tool?: string; args?: Record<string, unknown> }
        if (typeof payload.tool !== 'string') {
          writeJson(res, 400, { ok: false, error: 'missing tool' })
          return
        }
        const result = await store.executeTool(DEFAULT_SCENE, payload.tool, payload.args ?? {})
        writeJson(res, 200, result)
      } catch (error) {
        writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }))
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/api/playground/session',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        writeJson(res, 200, store.get(DEFAULT_SCENE))
        return
      }
      if (req.method === 'POST') {
        try {
          const payload = await readJsonBody(req) as { map?: unknown }
          if (payload.map === undefined) {
            writeJson(res, 400, { error: 'missing map' })
            return
          }
          writeJson(res, 200, store.set(DEFAULT_SCENE, createSceneState(payload.map)))
        } catch (error) {
          writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
        }
        return
      }
      writeJson(res, 405, { error: 'method not allowed' })
    },
  }))
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/api/playground/session/action-complete',
    handler: async (req, res) => {
      try {
        const payload = await readJsonBody(req) as { requestId?: string }
        if (typeof payload.requestId !== 'string' || payload.requestId.length === 0) {
          writeJson(res, 400, { ok: false, error: 'requestId 不能为空' })
          return
        }
        const ok = store.acknowledgeAction(DEFAULT_SCENE, payload.requestId)
        writeJson(res, ok ? 200 : 404, ok ? { ok: true } : { ok: false, error: '当前没有可用 session' })
      } catch (error) {
        writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }))
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/api/playground/session/events',
    handler: (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
      const snapshot = store.get(DEFAULT_SCENE)
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`)
      const unsubscribe = store.subscribe(DEFAULT_SCENE, (_key, state) => {
        res.write(`data: ${JSON.stringify(state)}\n\n`)
      })
      req.on('close', () => {
        unsubscribe()
      })
    },
  }))
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/api/playground/export/jpg',
    handler: (_req, res) => {
      const scene = store.has(DEFAULT_SCENE) ? store.get(DEFAULT_SCENE) : null
      const result = readPlaygroundPreviewJpg(
        scene === null ? null : { map: scene.map, messages: [], actionRequest: null, actionQueue: scene.actionQueue, previewJpgDataUrl: null, updatedAt: scene.updatedAt },
      )
      writeJson(res, result.ok ? 200 : 404, result)
    },
  }))
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/api/mcp/tools',
    handler: async (req, res) => {
      const payload = req.method === 'POST' ? await readJsonBody(req) : {}
      writeJson(res, 200, await handleHttpMcpTools(payload as never))
    },
  }))
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/api/mcp/call',
    handler: async (req, res) => {
      const payload = await readJsonBody(req) as { name?: string; args?: Record<string, unknown> }
      const result = await store.executeTool(DEFAULT_SCENE, payload.name ?? '', payload.args ?? {})
      writeJson(res, 200, { ok: result.ok, content: result.summary })
    },
  }))

  // Static frontend + /demo.json under the mount prefix.
  disposers.push(webServer.register({
    kind: 'prefix',
    path,
    handler: async (req, res) => {
      const raw = req.url ?? '/'
      const url = new URL(raw, 'http://x')
      let pathname = url.pathname
      if (pathname.startsWith(`${path}/`)) pathname = pathname.slice(path.length)
      if (pathname === '/' || pathname === '') {
        res.statusCode = 302
        res.setHeader('Location', `${path}/chat`)
        res.end()
        return
      }
      await serveStaticFile(pathname, res, options.htmlInject)
    },
  }))

  // Root-level /demo.json for the chat page's fetch('/demo.json').
  disposers.push(webServer.register({
    kind: 'exact',
    path: '/demo.json',
    handler: async (_req, res) => serveStaticFile('/demo.json', res),
  }))

  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose()
  }
}
