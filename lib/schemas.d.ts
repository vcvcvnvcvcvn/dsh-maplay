/**
 * maplay tool schemas, converted from maplay's PLAYGROUND_TOOLS into the dsh
 * schema DSL (`@deepseek-ai/dsh-tools` ParameterSchemaSpec).
 *
 * These definitions are the single source of truth for what the agent can
 * call. Names and descriptions are kept identical to maplay so that prompts,
 * sessions, and MCP clients stay interchangeable.
 */
import type { ParameterSchemaSpec } from '@deepseek-ai/dsh-tools';
export interface MaplayToolSpec {
    /** maplay tool name, e.g. `moveTo`. */
    name: string;
    /** Model-facing description (same wording as maplay). */
    description: string;
    /** Parameter schema in dsh DSL. */
    parameters: ParameterSchemaSpec;
    /** True when the call never mutates the scene (safe to run concurrently). */
    concurrencySafe: boolean;
}
export declare const MAPLAY_TOOL_SPECS: MaplayToolSpec[];
/** All maplay tool names, in registration order. */
export declare const MAPLAY_TOOL_NAMES: string[];
//# sourceMappingURL=schemas.d.ts.map