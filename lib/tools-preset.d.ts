/**
 * dsh-maplay-tools — the agent-preset half of dsh-maplay.
 *
 * The host half (`./index.ts`) owns the process-wide map session, the web
 * surface, and the chat bridge, and publishes the tool executor under the
 * `maplay` service. This plugin is the preset-facing half: it reads that
 * executor and registers the maplay tool suite plus the system-prompt section
 * into the mounting session's own scope, so only an agent composed with this
 * preset sees the 29 maplay tools.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name used by loader diagnostics. */
export declare const name = "dsh-maplay-tools";
/** Hard dependencies: the model-facing registries this half writes into. */
export declare const inject: string[];
/** Plugin config. Every field has a default, mirroring the host half. */
export interface Config {
    /** Prefix added to every exposed tool name, e.g. `maplay_` avoids name collisions. Defaults to ''. */
    prefix?: string;
    /** Only these maplay tools are registered. Defaults to all. */
    tools?: string[];
    /** Cooperative per-tool-call timeout (ms). Defaults to 30000. */
    fetchTimeoutMs?: number;
    /** Cap on board text included in tool results (chars). Defaults to 12000. */
    maxBoardChars?: number;
}
export declare const Config: z<Config>;
/**
 * Register the maplay tools and prompt into the current session scope.
 * The `maplay` service (process-wide executor) must be provided by the host
 * half; without it the preset mounts but cannot contribute tools, which is a
 * misconfiguration and fails loud here.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=tools-preset.d.ts.map