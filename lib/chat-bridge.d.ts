/**
 * OpenAI-compatible chat bridge for the maplay chat frontend.
 *
 * maplay's `/chat` page is a thin client: it POSTs its full conversation plus
 * a scene summary to the same-origin `/api/chat` endpoint and expects an
 * OpenAI-style `{ text, toolCalls }` reply; the frontend then executes any
 * tool calls itself (locally, animating its own map) and sends the tool
 * results back on the next request.
 *
 * This module re-implements that endpoint on the dsh side so the maplay chat
 * page becomes the dsh frontend: the model request goes through dsh's
 * `ctx.llm` (provider, model, credentials all come from dsh's own
 * configuration), and the tool schema is the same maplay tool suite the
 * plugin registers. The page needs no changes and no API key entry.
 *
 * The `tools` list is derived from the plugin's `MAPLAY_TOOL_SPECS` (single
 * source of truth), projected to the JSON-schema shape `ctx.llm` expects.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ModelSelection } from '@deepseek-ai/dsh-agent';
import { type ContentBlock, type GenerateOptions, type LlmRuntime, type ToolSchema } from '@deepseek-ai/dsh-llm';
/** maplay conversation message shape (mirror of maplay's OssConversationMessage). */
export interface OssConversationMessage {
    id: string;
    role: 'user' | 'assistant' | 'tool';
    text?: string;
    toolName?: string;
    toolCalls?: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>;
    result?: {
        ok?: boolean;
        summary?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
/** maplay chat request shape (mirror of maplay's OssChatRequest). */
export interface OssChatRequest {
    scene?: {
        mapName?: string;
        [key: string]: unknown;
    };
    apiConfig?: {
        systemPrompt?: string;
        [key: string]: unknown;
    };
    messages: OssConversationMessage[];
}
/** maplay chat response shape (mirror of maplay's OssChatResponse). */
export interface OssChatResponse {
    text: string;
    toolCalls: Array<{
        id: string;
        name: string;
        arguments: Record<string, unknown>;
    }>;
}
/** The tool schemas sent to the model, in `ctx.llm` shape. */
export declare function maplayToolSchemas(): ToolSchema[];
/**
 * Serve one `/api/chat` request: assemble the dsh llm call from the maplay
 * payload and stream the reply back into `{ text, toolCalls }`.
 */
export declare function handleChatBridge(ctx: Context, llm: LlmRuntime, selection: ModelSelection, payload: OssChatRequest, signal?: AbortSignal, systemPromptOverride?: string): Promise<OssChatResponse>;
export type { ContentBlock, GenerateOptions, LlmRuntime, ToolSchema };
//# sourceMappingURL=chat-bridge.d.ts.map