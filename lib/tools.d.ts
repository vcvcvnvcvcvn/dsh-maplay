/**
 * Registers the maplay tools into `ctx.tools` (dsh's model-facing tool
 * registry). Every call is bridged to the running maplay server over HTTP; the
 * agent loop, approval pipeline, timeouts, and session logging all belong to
 * dsh, while the actual scene mutations happen in maplay.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type GenericCallView } from '@deepseek-ai/dsh-tools';
import type { MaplayClient } from './client.js';
import { type MaplayToolSpec } from './schemas.js';
/** Board snapshot shape returned by maplay's get_board_info / /api/board. */
interface BoardLike {
    mapName?: string;
    gridSize?: unknown;
    counts?: Record<string, number>;
    entities?: Array<Record<string, unknown>>;
    sceneObjects?: Array<Record<string, unknown>>;
    textBoxes?: Array<Record<string, unknown>>;
    walls?: unknown[];
    markers?: unknown[];
    doors?: unknown[];
}
/** Render a board snapshot as a compact, model-friendly text block. */
export declare function formatBoard(board: BoardLike, maxChars: number): string;
/** Render one maplay tool result as the model-facing text block. */
export declare function formatResult(value: unknown, maxBoardChars: number): string;
/** Pending-call card shown while a maplay tool runs. */
export declare function presentMaplayCall(spec: MaplayToolSpec, args: Record<string, unknown>): GenericCallView;
export interface RegisterMaplayToolsOptions {
    /** Optional prefix added to every exposed tool name, e.g. `maplay_`. */
    prefix?: string;
    /** Only these maplay tool names are registered (default: all). */
    enabledTools?: string[];
    /** Timeout attached to each tool call (ms). */
    timeoutMs?: number;
    /** Cap on formatted board text per result (chars). */
    maxBoardChars?: number;
}
/**
 * Register each configured maplay tool. Registrations are effect-scoped: they
 * unregister automatically when the plugin fiber is disposed.
 */
export declare function registerMaplayTools(ctx: Context, client: MaplayClient, options: RegisterMaplayToolsOptions): number;
export {};
//# sourceMappingURL=tools.d.ts.map