/**
 * dsh-maplay — a DeepSeek Harness plugin that turns the maplay 2D map
 * animation playground into agent-controllable tools.
 *
 * What the plugin does, following the "everything is a plugin" model:
 *
 *  1. Registers the full maplay tool suite (moveTo, emote, shoot, flyTo, ...)
 *     into `ctx.tools`, bridged over maplay's HTTP API. The agent loop, tool
 *     approval, timeouts, and session logs stay dsh's.
 *  2. Optionally spawns the maplay Vite dev server as a child process and
 *     loads a map JSON into its session, so `dsh web --patch` is a
 *     one-command bring-up.
 *  3. Optionally registers a `/maplay` reverse-proxy route on
 *     `ctx.webServer`, embedding the live playground in the dsh Web UI.
 *  4. Adds a system-prompt section teaching the model when to use the tools.
 *
 * The plugin fiber stays in LOADING until the maplay server is healthy and
 * the optional map is loaded; a failure rejects the fiber (Cordis rolls the
 * plugin back). Every effect unwinds on dispose, and the spawned maplay
 * process is terminated too.
 *
 * @module dsh-maplay
 */

import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { MaplayClient } from './client.js'
import { registerMaplayTools } from './tools.js'
import { ensureMaplayServer, stopMaplayServer, type MaplaySpawnResult } from './spawn.js'
import { registerMaplayProxy } from './proxy.js'

/** Stable Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-maplay'

/** Services required by the plugin. `webServer` is optional (checked via ctx.get). */
export const inject = ['tools', 'systemPrompt']

/** Plugin config. Every field has a default, so a bare `- insert: { name: dsh-maplay }` already works. */
export interface Config {
  /** Base URL of the maplay server. Defaults to http://127.0.0.1:8992. */
  baseUrl?: string
  /** Spawn the maplay Vite dev server when nothing answers at baseUrl. Defaults to true. */
  spawn?: boolean
  /** Absolute path to a maplay checkout. Required when `spawn` is true and no server is running. */
  maplayDir?: string
  /** Host passed to the spawned vite process. Defaults to 127.0.0.1. */
  host?: string
  /** Port passed to the spawned vite process. Defaults to 8992. */
  port?: number
  /** Wait budget for the spawned server to become healthy (ms). Defaults to 60000. */
  startupTimeoutMs?: number
  /** Optional map JSON file to load into the maplay session on startup. */
  mapFile?: string
  /** Prefix added to every exposed tool name, e.g. `maplay_` avoids name collisions. Defaults to ''. */
  prefix?: string
  /** Only these maplay tools are registered. Defaults to all. */
  tools?: string[]
  /** Cooperative per-tool-call timeout (ms). Defaults to 30000. */
  fetchTimeoutMs?: number
  /** Cap on board text included in tool results (chars). Defaults to 12000. */
  maxBoardChars?: number
  /** Register the /maplay reverse proxy on ctx.webServer. Defaults to true. */
  exposeWeb?: boolean
  /** Route prefix for the embedded maplay view. Defaults to /maplay. */
  webPath?: string
}

export const Config: z<Config> = z.object({
  baseUrl: z.string().default('http://127.0.0.1:8992'),
  spawn: z.boolean().default(true),
  maplayDir: z.string(),
  host: z.string().default('127.0.0.1'),
  port: z.number().default(8992),
  startupTimeoutMs: z.number().default(60_000),
  mapFile: z.string(),
  prefix: z.string().default(''),
  tools: z.array(z.string()),
  fetchTimeoutMs: z.number().default(30_000),
  maxBoardChars: z.number().default(12_000),
  exposeWeb: z.boolean().default(true),
  webPath: z.string().default('/maplay'),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** Load a map JSON file and POST it as the maplay playground session. */
async function loadMapFile(client: MaplayClient, mapFile: string): Promise<void> {
  let raw: string
  try {
    raw = await readFile(mapFile, 'utf8')
  } catch (error) {
    throw new Error(`dsh-maplay: cannot read mapFile "${mapFile}": ${error instanceof Error ? error.message : String(error)}`)
  }
  let map: unknown
  try {
    map = JSON.parse(raw)
  } catch (error) {
    throw new Error(`dsh-maplay: mapFile "${mapFile}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const accepted = await client.loadSession({
    map,
    messages: [],
    actionRequest: null,
    actionQueue: [],
    updatedAt: Date.now(),
  })
  if (!accepted) throw new Error(`dsh-maplay: maplay rejected map from "${mapFile}"`)
}

/**
 * Mount the plugin. Synchronous registrations happen first (tools, prompt
 * section, proxy, spawn teardown); then the fiber awaits the async bring-up
 * (spawn maplay if needed, load the map) and rejects on failure so Cordis
 * rolls the plugin back.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved = config as ResolvedConfig
  const client = new MaplayClient({
    baseUrl: resolved.baseUrl,
    fetchTimeoutMs: resolved.fetchTimeoutMs,
  })

  // Kill the spawned maplay process when the plugin unloads.
  let spawnResult: MaplaySpawnResult = { spawned: false }
  ctx.effect(() => {
    return () => {
      if (spawnResult.spawned) stopMaplayServer(spawnResult.proc)
    }
  }, 'dsh-maplay.spawn')

  // Tool registrations are fiber-scoped and unregister on dispose.
  // schemastery coerces an absent `tools` array to [], which must mean
  // "register everything" rather than "register nothing".
  const enabledTools = resolved.tools.length > 0 ? resolved.tools : undefined
  const registeredCount = registerMaplayTools(ctx, client, {
    prefix: resolved.prefix,
    enabledTools,
    timeoutMs: resolved.fetchTimeoutMs,
    maxBoardChars: resolved.maxBoardChars,
  })
  ctx.logger.info(`dsh-maplay: registered ${registeredCount} maplay tools`)

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
  // The webServer service may activate after this plugin (it lives in the
  // web-app bundle), so probe after the spawn decision below and again
  // whenever any service binding changes. `proxyStripPrefix` is decided by
  // the spawn outcome: vite started with `--base=<path>/` already emits
  // prefixed URLs, so the proxy must NOT strip; an external maplay (or a
  // non-web spawn) emits root-relative URLs, so the proxy strips.
  let proxyStripPrefix = true
  let proxyRegistered = false
  const registerProxy = (server: unknown): void => {
    if (proxyRegistered) return
    proxyRegistered = true
    ctx.effect(() => {
      return registerMaplayProxy(server as Parameters<typeof registerMaplayProxy>[0], {
        path: resolved.webPath,
        baseUrl: resolved.baseUrl,
        stripPrefix: proxyStripPrefix,
      })
    }, 'dsh-maplay.proxy')
  }
  const probeWebServer = (): void => {
    if (proxyRegistered || !resolved.exposeWeb) return
    const server = ctx.get('webServer')
    if (server !== undefined) registerProxy(server)
  }

  // Async bring-up: from here on, failures reject the fiber.
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
      // Match vite's emitted asset URLs to the web mount so the embedded
      // /maplay view loads its modules.
      base: resolved.exposeWeb ? `${resolved.webPath}/` : '',
      startupTimeoutMs: resolved.startupTimeoutMs,
    })
    // vite started with `--base=<path>/`: asset URLs already carry the mount
    // prefix, so the proxy forwards paths verbatim.
    if (spawnResult.spawned && resolved.exposeWeb) proxyStripPrefix = false
  } else if (!(await client.health())) {
    throw new Error(
      `dsh-maplay: spawn is disabled but no maplay server answers at ${resolved.baseUrl}. ` +
      'Start maplay first (npm run dev in the maplay checkout) or enable spawn.',
    )
  }

  // Register the proxy now that the strip decision is final; keep listening
  // for a late webServer activation.
  if (resolved.exposeWeb) {
    probeWebServer()
    ctx.on('internal/service', probeWebServer, { global: true })
  }

  if (resolved.mapFile !== undefined && resolved.mapFile.length > 0) {
    await loadMapFile(client, resolved.mapFile)
  }
}

export { MaplayClient, MaplayError, type MaplayToolResult, type MaplayToolInfo, type MaplayClientOptions } from './client.js'
export { MAPLAY_TOOL_SPECS, MAPLAY_TOOL_NAMES, type MaplayToolSpec } from './schemas.js'
export { formatBoard, formatResult } from './tools.js'
