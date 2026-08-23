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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name used by loader diagnostics. */
export declare const name = "dsh-maplay";
/**
 * Services required by the host half. `webServer` is optional (checked via
 * ctx.get). The model-facing `tools`/`systemPrompt` registries are NOT injected
 * here anymore: they belong to the preset half (`tools-preset.ts`), which the
 * host half feeds by publishing the executor under the `maplay` service.
 */
export declare const inject: string[];
/** Plugin config. Every field has a default, so a bare `- insert: { name: dsh-maplay }` already works. */
export interface Config {
    /**
     * Self-contained mode: run maplay's executor in-process and serve the built
     * frontend from the @vcvcvn/maplay package. Defaults to true.
     */
    embedded?: boolean;
    /** Map JSON to load into the session. Defaults to the maplay package's demo.json. */
    mapFile?: string;
    /** Base URL of an external maplay server (external mode). Defaults to http://127.0.0.1:8992. */
    baseUrl?: string;
    /** Spawn an external maplay dev server when nothing answers at baseUrl (external mode). Defaults to true. */
    spawn?: boolean;
    /** Absolute path to a maplay checkout (external mode + spawn). */
    maplayDir?: string;
    /** Host passed to the spawned vite process. Defaults to 127.0.0.1. */
    host?: string;
    /** Port passed to the spawned vite process. Defaults to 8992. */
    port?: number;
    /** Wait budget for the spawned server to become healthy (ms). Defaults to 60000. */
    startupTimeoutMs?: number;
    /** Prefix added to every exposed tool name, e.g. `maplay_` avoids name collisions. Defaults to ''. */
    prefix?: string;
    /** Only these maplay tools are registered. Defaults to all. */
    tools?: string[];
    /** Cooperative per-tool-call timeout (ms). Defaults to 30000. */
    fetchTimeoutMs?: number;
    /** Cap on board text included in tool results (chars). Defaults to 12000. */
    maxBoardChars?: number;
    /** Register the web surface on ctx.webServer. Defaults to true. */
    exposeWeb?: boolean;
    /** Route prefix for the embedded maplay view. Defaults to /maplay. */
    webPath?: string;
    /**
     * Serve `/api/chat` from dsh (model via ctx.llm) so the maplay chat page
     * becomes the dsh frontend, and redirect `/` to the chat page. Defaults to true.
     */
    chatBridge?: boolean;
    /**
     * System prompt used by the chat bridge. When unset, a maplay-friendly
     * default is used; the frontend's own AI settings panel is ignored in dsh mode.
     */
    chatSystemPrompt?: string;
}
export declare const Config: z<Config>;
/**
 * Mount the plugin. Embedded mode is the default and fully self-contained;
 * set `embedded: false` to bridge to an external maplay server instead.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
export { MaplayClient, MaplayError, type MaplayToolResult, type MaplayToolInfo, type MaplayClientOptions } from './client.js';
export { MAPLAY_TOOL_SPECS, MAPLAY_TOOL_NAMES, type MaplayToolSpec } from './schemas.js';
export { formatBoard, formatResult } from './tools.js';
export { EmbeddedExecutor, HttpExecutor, type ToolExecutor } from './executor.js';
export { serveMaplayEmbedded, maplayPackageRoot } from './embedded-web.js';
export { SceneStore, DEFAULT_SCENE, createSceneState, type SceneState, type SceneToolResult } from './scene-store.js';
//# sourceMappingURL=index.d.ts.map