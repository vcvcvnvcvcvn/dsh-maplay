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

import type { IncomingMessage, ServerResponse } from 'node:http'
import { request as httpRequest } from 'node:http'

/** maplay API paths registered as exact root routes so the embedded page's root-relative fetches reach maplay. */
export const MAPLAY_API_PATHS = [
  '/api/board',
  '/api/tools/list',
  '/api/tools/call',
  '/api/playground/session',
  '/api/playground/session/action-complete',
  '/api/playground/session/events',
  '/api/playground/export/jpg',
  '/api/mcp/tools',
  '/api/mcp/call',
] as const

/** Static assets maplay serves at the root that the embedded frontends load directly. */
export const MAPLAY_ROOT_PATHS = [
  '/demo.json',
] as const

export interface RegisterMaplayProxyOptions {
  /** Path prefix registered on ctx.webServer, e.g. `/maplay`. */
  path?: string
  /** Upstream maplay origin, e.g. http://127.0.0.1:8992 */
  baseUrl: string
  /**
   * Strip the mount prefix when forwarding. True for an externally started
   * maplay (vite emits root-relative URLs); false when the plugin spawned
   * maplay with `--base=<path>/` (vite already emits prefixed URLs).
   */
  stripPrefix?: boolean
  /**
   * Register an exact `/` route that redirects to `<path>/chat`, turning the
   * maplay chat page into the dsh frontend landing page.
   */
  rootToChat?: boolean
  /**
   * When set, an exact `/api/chat` route is registered with this handler
   * instead of proxying to maplay (the plugin's own chat bridge).
   */
  chatHandler?: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  /**
   * Optional per-response HTML injection for proxied pages; receives the
   * upstream pathname and may return a snippet (or undefined to skip). Used
   * to flip the maplay chat page into dsh mode.
   */
  htmlInject?: (pathname: string) => string | undefined
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
export function proxyToMaplay(
  baseUrl: string,
  req: IncomingMessage,
  res: ServerResponse,
  stripPrefix?: string,
  prependPrefix?: string,
  htmlInject?: (pathname: string) => string | undefined,
): void {
  const upstream = new URL(baseUrl)
  const raw = req.url ?? '/'
  const url = new URL(raw, upstream.origin)
  if (stripPrefix !== undefined && url.pathname.startsWith(`${stripPrefix}/`)) {
    url.pathname = url.pathname.slice(stripPrefix.length)
  } else if (prependPrefix !== undefined) {
    url.pathname = `${prependPrefix}${url.pathname}`
  }

  const headers: Record<string, string | string[] | undefined> = { ...req.headers }
  delete headers.host
  headers.host = upstream.host

  const upstreamReq = httpRequest(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || undefined,
      method: req.method,
      path: `${url.pathname}${url.search}`,
      headers,
    },
    (upstreamRes) => {
      const status = upstreamRes.statusCode ?? 502
      // Rewrite root-relative redirect targets so the browser stays inside the
      // /maplay mount (maplay redirects /playground -> /playground.html).
      const headers = { ...upstreamRes.headers }
      if (status >= 300 && status < 400) {
        const location = headers.location
        if (typeof location === 'string' && location.startsWith('/')) {
          headers.location = `${stripPrefix ?? ''}${location}`
        }
      }
      // Inject a snippet into HTML pages when the caller asked for it.
      const inject = htmlInject?.(url.pathname)
      const contentType = typeof headers['content-type'] === 'string' ? headers['content-type'] : ''
      if (inject !== undefined && req.method === 'GET' && contentType.includes('text/html')) {
        let body = ''
        upstreamRes.setEncoding('utf8')
        upstreamRes.on('data', (chunk) => { body += chunk })
        upstreamRes.on('end', () => {
          const injected = body.includes('</head>')
            ? body.replace('</head>', `${inject}</head>`)
            : body + inject
          headers['content-length'] = String(Buffer.byteLength(injected))
          delete headers['transfer-encoding']
          res.writeHead(status, headers)
          res.end(injected)
        })
        return
      }
      res.writeHead(status, headers)
      upstreamRes.pipe(res)
    },
  )

  upstreamReq.on('error', (error) => {
    if (res.headersSent) {
      res.destroy(error)
    } else {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: `maplay proxy error: ${error.message}` }))
    }
  })

  req.pipe(upstreamReq)
}

/**
 * Register the routes. Returns a disposer; `ctx.webServer` route registrations
 * are NOT effect-scoped automatically (the route tables are plain maps), so
 * the disposer must be returned from a `ctx.effect` body.
 */
export function registerMaplayProxy(
  webServer: {
    register(route: {
      kind: 'exact' | 'prefix'
      path: string
      handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>
    }): () => void
  },
  options: RegisterMaplayProxyOptions,
): () => void {
  const path = options.path ?? '/maplay'
  const upstream = options.baseUrl.replace(/\/+$/, '')
  // strip: mount-prefixed requests forwarded to a root-relative upstream;
  // prepend: root-relative requests forwarded to a base-prefixed upstream.
  const strip = options.stripPrefix !== false ? path : undefined
  const prepend = options.stripPrefix === false ? path : undefined
  const disposers: Array<() => void> = []

  if (options.rootToChat) {
    // / -> /maplay/chat so opening dsh lands on the maplay chat page.
    disposers.push(webServer.register({
      kind: 'exact',
      path: '/',
      handler(req, res) {
        const search = (req.url ?? '').includes('?') ? (req.url ?? '').slice((req.url ?? '').indexOf('?')) : ''
        res.statusCode = 302
        res.setHeader('Location', `${path}/chat${search}`)
        res.end()
      },
    }))
  }

  // The chat bridge owns /api/chat; everything else in the API surface still proxies.
  if (options.chatHandler !== undefined) {
    disposers.push(webServer.register({
      kind: 'exact',
      path: '/api/chat',
      handler: options.chatHandler,
    }))
  }

  disposers.push(webServer.register({
    kind: 'prefix',
    path,
    handler(req, res) {
      // /maplay -> /maplay/chat so the mounted root points at the chat page.
      const raw = req.url ?? '/'
      const pathname = raw.split('?')[0] ?? '/'
      if (pathname === path || pathname === `${path}/`) {
        const search = raw.includes('?') ? raw.slice(raw.indexOf('?')) : ''
        res.statusCode = 302
        res.setHeader('Location', `${path}/chat${search}`)
        res.end()
        return
      }
      proxyToMaplay(upstream, req, res, strip, undefined, options.htmlInject)
    },
  }))

  // Exact root routes for maplay's root-relative API calls.
  for (const apiPath of MAPLAY_API_PATHS) {
    disposers.push(webServer.register({
      kind: 'exact',
      path: apiPath,
      handler: (req, res) => proxyToMaplay(upstream, req, res),
    }))
  }

  // Root-level static assets the frontends fetch (e.g. /demo.json for the map).
  for (const rootPath of MAPLAY_ROOT_PATHS) {
    disposers.push(webServer.register({
      kind: 'exact',
      path: rootPath,
      handler: (req, res) => proxyToMaplay(upstream, req, res, undefined, prepend),
    }))
  }

  return () => {
    for (const dispose of disposers.splice(0).reverse()) dispose()
  }
}
