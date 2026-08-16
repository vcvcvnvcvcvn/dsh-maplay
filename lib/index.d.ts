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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name used by loader diagnostics. */
export declare const name = "dsh-maplay";
/** Services required by the plugin. `webServer` is optional (checked via ctx.get). */
export declare const inject: string[];
/** Plugin config. Every field has a default, so a bare `- insert: { name: dsh-maplay }` already works. */
export interface Config {
    /** Base URL of the maplay server. Defaults to http://127.0.0.1:8992. */
    baseUrl?: string;
    /** Spawn the maplay Vite dev server when nothing answers at baseUrl. Defaults to true. */
    spawn?: boolean;
    /** Absolute path to a maplay checkout. Required when `spawn` is true and no server is running. */
    maplayDir?: string;
    /** Host passed to the spawned vite process. Defaults to 127.0.0.1. */
    host?: string;
    /** Port passed to the spawned vite process. Defaults to 8992. */
    port?: number;
    /** Wait budget for the spawned server to become healthy (ms). Defaults to 60000. */
    startupTimeoutMs?: number;
    /** Optional map JSON file to load into the maplay session on startup. */
    mapFile?: string;
    /** Prefix added to every exposed tool name, e.g. `maplay_` avoids name collisions. Defaults to ''. */
    prefix?: string;
    /** Only these maplay tools are registered. Defaults to all. */
    tools?: string[];
    /** Cooperative per-tool-call timeout (ms). Defaults to 30000. */
    fetchTimeoutMs?: number;
    /** Cap on board text included in tool results (chars). Defaults to 12000. */
    maxBoardChars?: number;
    /** Register the /maplay reverse proxy on ctx.webServer. Defaults to true. */
    exposeWeb?: boolean;
    /** Route prefix for the embedded maplay view. Defaults to /maplay. */
    webPath?: string;
}
export declare const Config: z<Config>;
/**
 * Mount the plugin. Synchronous registrations happen first (tools, prompt
 * section, proxy, spawn teardown); then the fiber awaits the async bring-up
 * (spawn maplay if needed, load the map) and rejects on failure so Cordis
 * rolls the plugin back.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
export { MaplayClient, MaplayError, type MaplayToolResult, type MaplayToolInfo, type MaplayClientOptions } from './client.js';
export { MAPLAY_TOOL_SPECS, MAPLAY_TOOL_NAMES, type MaplayToolSpec } from './schemas.js';
export { formatBoard, formatResult } from './tools.js';
//# sourceMappingURL=index.d.ts.map