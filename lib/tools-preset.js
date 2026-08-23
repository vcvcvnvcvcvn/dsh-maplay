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
import z from '@deepseek-ai/schemastery';
import { registerMaplayTools } from './tools.js';
/** Stable Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-maplay-tools';
/** Hard dependencies: the model-facing registries this half writes into. */
export const inject = ['tools', 'systemPrompt'];
export const Config = z.object({
    prefix: z.string().default(''),
    tools: z.array(z.string()),
    fetchTimeoutMs: z.number().default(30_000),
    maxBoardChars: z.number().default(12_000),
});
/**
 * Register the maplay tools and prompt into the current session scope.
 * The `maplay` service (process-wide executor) must be provided by the host
 * half; without it the preset mounts but cannot contribute tools, which is a
 * misconfiguration and fails loud here.
 */
export function apply(ctx, config) {
    const resolved = config;
    const executor = ctx.get('maplay');
    if (executor === undefined) {
        throw new Error('dsh-maplay-tools: the `maplay` executor service is unavailable. Mount the dsh-maplay host plugin (its index.js) before this preset half.');
    }
    // schemastery coerces an absent `tools` array to [], which must mean
    // "register everything" rather than "register nothing".
    const enabledTools = resolved.tools !== undefined && resolved.tools.length > 0 ? resolved.tools : undefined;
    registerMaplayTools(ctx, executor, {
        prefix: resolved.prefix,
        enabledTools,
        timeoutMs: resolved.fetchTimeoutMs,
        maxBoardChars: resolved.maxBoardChars,
    });
    ctx.systemPrompt.section({
        name: 'tool:dsh-maplay',
        order: 120,
        text: `maplay tools control a live 2D map animation scene (entities, objects, walls, doors, camera, ` +
            `projectiles, emotion bubbles). Before animating, call get_board_info to learn the real IDs that ` +
            `exist on the current board, and only use IDs returned there. Each call applies one animation beat; ` +
            `compose several calls to tell a story. When a tool reports an error such as an unknown target, ` +
            `re-read the board and retry with a real ID.`,
    });
}
//# sourceMappingURL=tools-preset.js.map