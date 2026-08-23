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
import { createAssistantMessage, createToolResultMessage, createUserMessage, } from '@deepseek-ai/dsh-llm';
import { parameterSchemaSpecToJsonSchema } from '@deepseek-ai/dsh-tools';
import { MAPLAY_TOOL_SPECS } from './schemas.js';
/** The tool schemas sent to the model, in `ctx.llm` shape. */
export function maplayToolSchemas() {
    return MAPLAY_TOOL_SPECS.map((spec) => ({
        name: spec.name,
        description: spec.description,
        parameters: parameterSchemaSpecToJsonSchema(spec.parameters),
    }));
}
/**
 * Serve one `/api/chat` request: assemble the dsh llm call from the maplay
 * payload and stream the reply back into `{ text, toolCalls }`.
 */
export async function handleChatBridge(ctx, llm, selection, payload, signal, systemPromptOverride) {
    // In dsh mode the system prompt comes from dsh's own config, not from the
    // page's (hidden) AI settings panel.
    const systemPrompt = systemPromptOverride
        ?? payload.apiConfig?.systemPrompt
        ?? 'You are a map animation assistant. When the user asks for animation, movement, emotes, state changes, or camera work, you must call tools. Tool arguments must only use IDs that exist in the current scene summary. Do not invent IDs.';
    // Mirror maplay's server-side assembly: the user's system prompt plus the
    // current scene summary as the system slot.
    const sceneText = payload.scene !== undefined
        ? `Current scene summary:\n${JSON.stringify(payload.scene, null, 2)}`
        : '';
    const messages = [];
    const options = {
        provider: selection.provider,
        model: selection.model,
        ...(selection.reasoningEffort !== undefined ? { reasoningEffort: selection.reasoningEffort } : {}),
        system: sceneText.length > 0 ? `${systemPrompt}\n\n${sceneText}` : systemPrompt,
        messages,
        tools: maplayToolSchemas(),
        signal,
    };
    for (const message of payload.messages ?? []) {
        if (message.role === 'user') {
            messages.push(createUserMessage({
                content: [{ type: 'text', text: message.text ?? '' }],
                source: { kind: 'user' },
            }));
        }
        else if (message.role === 'assistant') {
            const content = [];
            if (typeof message.text === 'string' && message.text.length > 0) {
                content.push({ type: 'text', text: message.text });
            }
            for (const toolCall of message.toolCalls ?? []) {
                content.push({
                    type: 'tool-call',
                    id: toolCall.id,
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.arguments ?? {}),
                });
            }
            if (content.length === 0)
                continue;
            messages.push(createAssistantMessage({
                content,
                source: { provider: selection.provider, model: selection.model },
            }));
        }
        else if (message.role === 'tool') {
            messages.push(createToolResultMessage({
                callId: message.id,
                content: [{
                        type: 'text',
                        text: typeof message.result === 'string'
                            ? message.result
                            : JSON.stringify(message.result ?? {}),
                    }],
                isError: !(message.result?.ok ?? false),
            }));
        }
    }
    // Stream the model reply, collecting complete blocks.
    const blocks = [];
    let failed;
    try {
        for await (const chunk of llm.stream(options)) {
            if (chunk.type === 'block-end') {
                blocks.push(chunk.block);
            }
        }
    }
    catch (error) {
        failed = error instanceof Error ? error : new Error(String(error));
    }
    if (failed !== undefined) {
        throw new Error(`dsh-maplay chat bridge: model request failed: ${failed.message}`);
    }
    const text = blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
    const toolCalls = blocks
        .filter((block) => block.type === 'tool-call')
        .map((block) => {
        let args = {};
        try {
            args = JSON.parse(block.arguments || '{}');
        }
        catch {
            // malformed arguments from the model: send back what we can
        }
        return { id: block.id, name: block.name, arguments: args };
    });
    return { text, toolCalls };
}
//# sourceMappingURL=chat-bridge.js.map