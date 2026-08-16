/**
 * dsh-maplay — a DeepSeek Harness plugin that turns the maplay 2D map
 * animation playground into agent-controllable tools.
 *
 * Two modes:
 *
 *  1. **Embedded (default, self-contained).** maplay's tool executor runs
 *     inside this process (bundled from @vcvcvn/maplay) and the built
 *     frontend is served through ctx.webServer. No maplay checkout, no vite,
 *     no extra process — `npm install dsh-maplay` is all a user needs.
 *  2. **External (compat).** The original bridge: tools call an externally
 *     running maplay server over HTTP (optionally spawned by the plugin).
 *
 * What the plugin does in both modes, following the "everything is a plugin"
 * model:
 *
 *  - Registers the full maplay tool suite (moveTo, emote, shoot, flyTo, ...)
 *    into `ctx.tools`.
 *  - Embeds the maplay chat page as the dsh frontend: `/` redirects to
 *    `/maplay/chat`, and `/api/chat` is served by the plugin's chat bridge
 *    (model + credentials come from dsh's ctx.llm). Playground pages receive
 *    animations over SSE from the in-process session.
 *  - Adds a system-prompt section teaching the model when to use the tools.
 *
 * Every registration is effect-scoped and unwinds when the plugin is
 * disposed.
 *
 * @module dsh-maplay
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { MaplayClient } from './client.js'
import { registerMaplayTools } from './tools.js'
import { ensureMaplayServer, stopMaplayServer, type MaplaySpawnResult } from './spawn.js'
import { registerMaplayProxy } from './proxy.js'
import { EmbeddedExecutor, HttpExecutor, loadEmbeddedMap, type ToolExecutor } from './executor.js'
import { maplayPackageRoot, serveMaplayEmbedded } from './embedded-web.js'
import { handleChatBridge, type OssChatRequest } from './chat-bridge.js'

/** Stable Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-maplay'

/** Services required by the plugin. `webServer` is optional (checked via ctx.get). */
export const inject = ['tools', 'systemPrompt', 'llm', 'agentDefaultModel']

/** Plugin config. Every field has a default, so a bare `- insert: { name: dsh-maplay }` already works. */
export interface Config {
  /**
   * Self-contained mode: run maplay's executor in-process and serve the built
   * frontend from the @vcvcvn/maplay package. Defaults to true.
   */
  embedded?: boolean
  /** Map JSON to load into the session. Defaults to the maplay package's demo.json. */
  mapFile?: string
  /** Base URL of an external maplay server (external mode). Defaults to http://127.0.0.1:8992. */
  baseUrl?: string
  /** Spawn an external maplay dev server when nothing answers at baseUrl (external mode). Defaults to true. */
  spawn?: boolean
  /** Absolute path to a maplay checkout (external mode + spawn). */
  maplayDir?: string
  /** Host passed to the spawned vite process. Defaults to 127.0.0.1. */
  host?: string
  /** Port passed to the spawned vite process. Defaults to 8992. */
  port?: number
  /** Wait budget for the spawned server to become healthy (ms). Defaults to 60000. */
  startupTimeoutMs?: number
  /** Prefix added to every exposed tool name, e.g. `maplay_` avoids name collisions. Defaults to ''. */
  prefix?: string
  /** Only these maplay tools are registered. Defaults to all. */
  tools?: string[]
  /** Cooperative per-tool-call timeout (ms). Defaults to 30000. */
  fetchTimeoutMs?: number
  /** Cap on board text included in tool results (chars). Defaults to 12000. */
  maxBoardChars?: number
  /** Register the web surface on ctx.webServer. Defaults to true. */
  exposeWeb?: boolean
  /** Route prefix for the embedded maplay view. Defaults to /maplay. */
  webPath?: string
  /**
   * Serve `/api/chat` from dsh (model via ctx.llm) so the maplay chat page
   * becomes the dsh frontend, and redirect `/` to the chat page. Defaults to true.
   */
  chatBridge?: boolean
  /**
   * System prompt used by the chat bridge. When unset, a maplay-friendly
   * default is used; the frontend's own AI settings panel is ignored in dsh mode.
   */
  chatSystemPrompt?: string
}

export const Config: z<Config> = z.object({
  embedded: z.boolean().default(true),
  mapFile: z.string(),
  baseUrl: z.string().default('http://127.0.0.1:8992'),
  spawn: z.boolean().default(true),
  maplayDir: z.string(),
  host: z.string().default('127.0.0.1'),
  port: z.number().default(8992),
  startupTimeoutMs: z.number().default(60_000),
  prefix: z.string().default(''),
  tools: z.array(z.string()),
  fetchTimeoutMs: z.number().default(30_000),
  maxBoardChars: z.number().default(12_000),
  exposeWeb: z.boolean().default(true),
  webPath: z.string().default('/maplay'),
  chatBridge: z.boolean().default(true),
  chatSystemPrompt: z.string(),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** Read a request body as JSON. */
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

/**
 * Serve one maplay-chat-style `/api/chat` POST: model comes from dsh's own
 * llm route (provider/model/credentials), tools are the registered maplay
 * suite; the reply keeps maplay's `{ text, toolCalls }` contract so the
 * unmodified chat page drives the scene exactly as before.
 */
async function serveChatBridge(
  ctx: Context,
  req: IncomingMessage,
  res: ServerResponse,
  systemPromptOverride?: string,
): Promise<void> {
  const writeError = (status: number, message: string): void => {
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: message }))
  }
  if (req.method !== 'POST') {
    writeError(405, `method ${req.method ?? '?'} not allowed`)
    return
  }
  try {
    const payload = await readJsonBody(req)
    const llm = ctx.get('llm')
    const defaultModel = ctx.get('agentDefaultModel')
    if (llm === undefined || defaultModel === undefined) {
      writeError(503, 'dsh-maplay: llm or agentDefaultModel service unavailable')
      return
    }
    const selection = defaultModel.currentSelection()
    if (selection.provider.length === 0 || selection.model.length === 0) {
      writeError(503, 'dsh-maplay: no model selected — configure a model in dsh first')
      return
    }
    const result = await handleChatBridge(ctx, llm, selection, payload as OssChatRequest, undefined, systemPromptOverride)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    ctx.logger.error(`dsh-maplay: chat bridge failed: ${message}`)
    writeError(502, message)
  }
}

/** Read a map JSON file (user path or the maplay package default). */
async function readMapFile(mapFile: string | undefined): Promise<unknown> {
  const file = mapFile !== undefined && mapFile.length > 0
    ? mapFile
    : join(maplayPackageRoot(), 'demo.json')
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    throw new Error(`dsh-maplay: cannot read map file "${file}": ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    throw new Error(`dsh-maplay: map file "${file}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** HTML snippet that flips the maplay chat page into dsh mode. */
function dshModeInject(ctx: Context): () => string | undefined {
  return () => {
    const defaultModel = ctx.get('agentDefaultModel')
    const model = defaultModel?.currentSelection().model ?? ''
    return `<script>window.__MAPPLAY_DSH__=true;window.__MAPPLAY_DSH_MODEL__=${JSON.stringify(model)};<\/script>`
  }
}

/** Mount the embedded (self-contained) mode. */
async function applyEmbedded(ctx: Context, resolved: ResolvedConfig): Promise<void> {
  // schemastery coerces an absent `tools` array to [], which must mean
  // "register everything" rather than "register nothing". Also guard the
  // raw-config path (tests, programmatic use) where tools may be undefined.
  const enabledTools = resolved.tools !== undefined && resolved.tools.length > 0 ? resolved.tools : undefined
  const executor = new EmbeddedExecutor(enabledTools)

  // Load the map into the in-process maplay session.
  const map = await readMapFile(resolved.mapFile)
  loadEmbeddedMap(map)

  registerMaplayTools(ctx, executor, {
    prefix: resolved.prefix,
    enabledTools,
    timeoutMs: resolved.fetchTimeoutMs,
    maxBoardChars: resolved.maxBoardChars,
  })
  ctx.logger.info(`dsh-maplay: embedded mode active (map: ${(map as { name?: string }).name ?? 'unknown'})`)

  ctx.systemPrompt.section({
    name: 'tool:dsh-maplay',
    order: 120,
    text:
      `maplay tools control a live 2D map animation scene (entities, objects, walls, doors, camera, ` +
      `projectiles, emotion bubbles). Before animating, call get_board_info to learn the real IDs that ` +
      `exist on the current board, and only use IDs returned there. Each call applies one animation beat; ` +
      `compose several calls to tell a story. When a tool reports an error such as an unknown target, ` +
      `re-read the board and retry with a real ID.`,
  })

  // Optional seam: serve the maplay frontend + API on ctx.webServer.
  // The webServer service may activate after this plugin (it lives in the
  // web-app bundle), so probe now and again whenever a service binding changes.
  let webRegistered = false
  const registerWeb = (): void => {
    if (webRegistered || !resolved.exposeWeb) return
    const webServer = ctx.get('webServer')
    if (webServer === undefined) return
    webRegistered = true
    ctx.effect(() => {
      return serveMaplayEmbedded(webServer, executor, {
        path: resolved.webPath,
        chatHandler: resolved.chatBridge
          ? (req, res) => serveChatBridge(ctx, req, res, resolved.chatSystemPrompt)
          : undefined,
        htmlInject: resolved.chatBridge ? dshModeInject(ctx) : undefined,
      })
    }, 'dsh-maplay.embedded-web')
  }
  registerWeb()
  ctx.on('internal/service', registerWeb, { global: true })
}

/** Mount the external (HTTP bridge) mode. */
async function applyExternal(ctx: Context, resolved: ResolvedConfig): Promise<void> {
  const client = new MaplayClient({
    baseUrl: resolved.baseUrl,
    fetchTimeoutMs: resolved.fetchTimeoutMs,
  })
  const executor = new HttpExecutor(client)

  let spawnResult: MaplaySpawnResult = { spawned: false }
  ctx.effect(() => {
    return () => {
      if (spawnResult.spawned) stopMaplayServer(spawnResult.proc)
    }
  }, 'dsh-maplay.spawn')

  const enabledTools = resolved.tools !== undefined && resolved.tools.length > 0 ? resolved.tools : undefined
  registerMaplayTools(ctx, executor, {
    prefix: resolved.prefix,
    enabledTools,
    timeoutMs: resolved.fetchTimeoutMs,
    maxBoardChars: resolved.maxBoardChars,
  })

  ctx.systemPrompt.section({
    name: 'tool:dsh-maplay',
    order: 120,
    text:
      `maplay tools control a live 2D map animation scene (entities, objects, walls, doors, camera, ` +
      `projectiles, emotion bubbles). Before animating, call get_board_info to learn the real IDs that ` +
      `exist on the current board, and only use IDs returned there. Each call applies one animation beat; ` +
      `compose several calls to tell a story. When a tool reports an error such as an unknown target, ` +
      `re-read the board and retry with a real ID.`,
  })

  // Optional seam: embed the maplay playground inside the dsh Web UI.
  let proxyStripPrefix = true
  let proxyRegistered = false
  const registerProxy = (server: unknown): void => {
    if (proxyRegistered) return
    proxyRegistered = true
    ctx.effect(() => {
      const webServer = server as Parameters<typeof registerMaplayProxy>[0]
      return registerMaplayProxy(webServer, {
        path: resolved.webPath,
        baseUrl: resolved.baseUrl,
        stripPrefix: proxyStripPrefix,
        rootToChat: resolved.chatBridge,
        chatHandler: resolved.chatBridge
          ? (req, res) => serveChatBridge(ctx, req, res, resolved.chatSystemPrompt)
          : undefined,
        htmlInject: resolved.chatBridge
          ? () => dshModeInject(ctx)()
          : undefined,
      })
    }, 'dsh-maplay.proxy')
  }
  const probeWebServer = (): void => {
    if (proxyRegistered || !resolved.exposeWeb) return
    const server = ctx.get('webServer')
    if (server !== undefined) registerProxy(server)
  }

  if (resolved.spawn) {
    if (resolved.maplayDir === undefined || resolved.maplayDir.length === 0) {
      throw new Error(
        'dsh-maplay: spawn is enabled but no maplayDir is configured. Point maplayDir at your maplay checkout, ' +
        'or set spawn: false and start maplay yourself.',
      )
    }
    spawnResult = await ensureMaplayServer(client, {
      maplayDir: resolved.maplayDir,
      host: resolved.host,
      port: resolved.port,
      base: resolved.exposeWeb && resolved.chatBridge ? `${resolved.webPath}/` : '',
      startupTimeoutMs: resolved.startupTimeoutMs,
    })
    if (spawnResult.spawned && resolved.exposeWeb) proxyStripPrefix = false
  } else if (!(await client.health())) {
    throw new Error(
      `dsh-maplay: spawn is disabled but no maplay server answers at ${resolved.baseUrl}. ` +
      'Start maplay first (npm run dev in the maplay checkout) or enable spawn.',
    )
  }

  if (resolved.exposeWeb) {
    probeWebServer()
    ctx.on('internal/service', probeWebServer, { global: true })
  }
}

/**
 * Mount the plugin. Embedded mode is the default and fully self-contained;
 * set `embedded: false` to bridge to an external maplay server instead.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved = config as ResolvedConfig
  if (resolved.embedded) {
    await applyEmbedded(ctx, resolved)
  } else {
    await applyExternal(ctx, resolved)
  }
}

export { MaplayClient, MaplayError, type MaplayToolResult, type MaplayToolInfo, type MaplayClientOptions } from './client.js'
export { MAPLAY_TOOL_SPECS, MAPLAY_TOOL_NAMES, type MaplayToolSpec } from './schemas.js'
export { formatBoard, formatResult } from './tools.js'
export { EmbeddedExecutor, HttpExecutor, loadEmbeddedMap, embeddedBoard, embeddedToolList, type ToolExecutor } from './executor.js'
export { serveMaplayEmbedded, maplayPackageRoot } from './embedded-web.js'
