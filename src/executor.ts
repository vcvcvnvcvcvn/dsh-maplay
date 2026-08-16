/**
 * Tool execution backends.
 *
 *  - `EmbeddedExecutor` runs maplay's real tool executor inside this process
 *    (bundled from @vcvcvn/maplay): no maplay server, no HTTP round trip. The
 *    map state lives in the maplay session singleton, animations are queued
 *    and broadcast to any connected playground page via SSE.
 *  - `HttpExecutor` keeps the original bridge mode for deployments that run
 *    maplay as an external service (baseUrl + optional spawn).
 */

import {
  createBoardInfo,
  getPlaygroundSessionState,
  handleHttpToolCall,
  handleHttpToolList,
  sanitizeMapDocument,
  setPlaygroundSessionState,
  type PlaygroundSessionState,
} from '@vcvcvn/maplay'
import type { MaplayClient, MaplayToolResult } from './client.js'

/** Uniform tool-call surface consumed by the registered dsh tools. */
export interface ToolExecutor {
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<MaplayToolResult>
}

/** Load a map document into the in-process maplay session. */
export function loadEmbeddedMap(map: unknown, messages?: PlaygroundSessionState['messages']): void {
  const state: PlaygroundSessionState = {
    map: sanitizeMapDocument(map as Parameters<typeof sanitizeMapDocument>[0]),
    messages: messages ?? [],
    actionRequest: null,
    actionQueue: [],
    updatedAt: Date.now(),
  }
  setPlaygroundSessionState(state)
}

/** Execute tools inside this process using maplay's real executor + session. */
export class EmbeddedExecutor implements ToolExecutor {
  constructor(private readonly tools: string[] | undefined) {}

  async call(name: string, args: Record<string, unknown>): Promise<MaplayToolResult> {
    if (this.tools !== undefined && !this.tools.includes(name)) {
      return { ok: false, summary: `tool ${name} is not enabled`, error: `tool ${name} is not enabled` }
    }
    const result = await handleHttpToolCall({ tool: name, args: args ?? {} })
    return {
      ok: result.ok,
      summary: result.summary,
      ...(result.applied !== undefined ? { applied: result.applied } : {}),
      ...((result as { board?: unknown }).board !== undefined ? { board: (result as { board?: unknown }).board } : {}),
      ...(result.error !== undefined ? { error: result.error } : {}),
    }
  }
}

/** Bridge to an externally running maplay server over its HTTP API. */
export class HttpExecutor implements ToolExecutor {
  constructor(private readonly client: MaplayClient) {}

  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<MaplayToolResult> {
    return await this.client.call(name, args, signal)
  }
}

/** Current board snapshot (used by the /api/board route and headless flows). */
export function embeddedBoard(): { ok: boolean; board?: unknown; error?: string } {
  const session = getPlaygroundSessionState()
  if (session === null) {
    return { ok: false, error: '当前没有可用地图' }
  }
  return { ok: true, board: createBoardInfo(session.map) }
}

/** maplay tool names from the process (used by /api/tools/list). */
export async function embeddedToolList(): Promise<Array<{ name: string; description: string }>> {
  return await handleHttpToolList()
}
