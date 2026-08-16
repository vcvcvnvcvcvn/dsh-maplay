/**
 * Minimal HTTP client for the maplay server API.
 *
 * maplay exposes an OpenAI-tool-like HTTP surface:
 *   GET  /api/tools/list   -> Array<{ name, description }>
 *   POST /api/tools/call   -> { tool, args } -> { ok, summary, applied?, board?, error? }
 *   GET  /api/board        -> { ok, board, updatedAt }
 *   POST /api/playground/session -> PlaygroundSessionState (load a map + messages)
 *
 * The dsh-maplay plugin talks to these endpoints only — it never imports
 * maplay's own runtime. That keeps the two projects decoupled: the plugin is a
 * thin, swappable bridge, exactly the "everything is a plugin" way.
 */

/** The normalized result shape returned by maplay's tool executor. */
export interface MaplayToolResult {
  ok: boolean
  summary: string
  /** High-level animation action applied, when the call produced one. */
  applied?: unknown
  /** Full board snapshot, returned by get_board_info. */
  board?: unknown
  error?: string
  [key: string]: unknown
}

/** One tool listed by maplay. */
export interface MaplayToolInfo {
  name: string
  description: string
}

export class MaplayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'MaplayError'
  }
}

export interface MaplayClientOptions {
  /** Base URL of the maplay server, e.g. http://127.0.0.1:8992 */
  baseUrl: string
  /** Cooperative per-request timeout in ms. */
  fetchTimeoutMs?: number
}

export class MaplayClient {
  readonly baseUrl: string
  private readonly fetchTimeoutMs: number

  constructor(options: MaplayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.fetchTimeoutMs = options.fetchTimeoutMs ?? 30_000
  }

  /** True when the maplay HTTP API answers. */
  async health(): Promise<boolean> {
    try {
      const res = await this.fetchJson('/api/tools/list', { method: 'GET' })
      return Array.isArray(res)
    } catch {
      return false
    }
  }

  /** List the tools maplay currently exposes. */
  async listTools(): Promise<MaplayToolInfo[]> {
    const res = await this.fetchJson('/api/tools/list', { method: 'GET' })
    if (!Array.isArray(res)) throw new MaplayError('maplay /api/tools/list returned a non-array payload')
    return res as MaplayToolInfo[]
  }

  /** Invoke one maplay tool. */
  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<MaplayToolResult> {
    const res = await this.fetchJson('/api/tools/call', {
      method: 'POST',
      body: JSON.stringify({ tool: name, args: args ?? {} }),
      signal,
    })
    if (res === null || typeof res !== 'object') throw new MaplayError('maplay /api/tools/call returned a non-object payload')
    return res as MaplayToolResult
  }

  /** Fetch the current board snapshot (GET /api/board). */
  async board(signal?: AbortSignal): Promise<{ ok: boolean; board?: unknown; error?: string }> {
    const res = await this.fetchJson('/api/board', { method: 'GET', signal })
    if (res === null || typeof res !== 'object') throw new MaplayError('maplay /api/board returned a non-object payload')
    return res as { ok: boolean; board?: unknown; error?: string }
  }

  /**
   * Load a full playground session (map + messages) into the running server.
   * Returns true when the session was accepted.
   */
  async loadSession(session: unknown, signal?: AbortSignal): Promise<boolean> {
    const res = await this.fetchJson('/api/playground/session', {
      method: 'POST',
      body: JSON.stringify(session),
      signal,
    })
    return res !== null && typeof res === 'object' && 'map' in (res as Record<string, unknown>)
  }

  /** Shared fetch with timeout + JSON parsing. */
  private async fetchJson(
    path: string,
    init: { method: string; body?: string; signal?: AbortSignal },
  ): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.fetchTimeoutMs)
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: init.body,
        signal,
      })
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error)
      throw new MaplayError(`maplay request failed (${this.baseUrl}${path}): ${cause}`)
    }
    if (!res.ok) {
      throw new MaplayError(`maplay responded ${res.status} for ${path}`, res.status)
    }
    return await res.json() as unknown
  }
}
