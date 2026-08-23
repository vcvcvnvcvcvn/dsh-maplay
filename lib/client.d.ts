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
    ok: boolean;
    summary: string;
    /** High-level animation action applied, when the call produced one. */
    applied?: unknown;
    /** Full board snapshot, returned by get_board_info. */
    board?: unknown;
    error?: string;
    [key: string]: unknown;
}
/** One tool listed by maplay. */
export interface MaplayToolInfo {
    name: string;
    description: string;
}
export declare class MaplayError extends Error {
    readonly status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
export interface MaplayClientOptions {
    /** Base URL of the maplay server, e.g. http://127.0.0.1:8992 */
    baseUrl: string;
    /** Cooperative per-request timeout in ms. */
    fetchTimeoutMs?: number;
}
export declare class MaplayClient {
    readonly baseUrl: string;
    private readonly fetchTimeoutMs;
    constructor(options: MaplayClientOptions);
    /** True when the maplay HTTP API answers. */
    health(): Promise<boolean>;
    /** List the tools maplay currently exposes. */
    listTools(): Promise<MaplayToolInfo[]>;
    /** Invoke one maplay tool. */
    call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<MaplayToolResult>;
    /** Fetch the current board snapshot (GET /api/board). */
    board(signal?: AbortSignal): Promise<{
        ok: boolean;
        board?: unknown;
        error?: string;
    }>;
    /**
     * Load a full playground session (map + messages) into the running server.
     * Returns true when the session was accepted.
     */
    loadSession(session: unknown, signal?: AbortSignal): Promise<boolean>;
    /** Shared fetch with timeout + JSON parsing. */
    private fetchJson;
}
//# sourceMappingURL=client.d.ts.map