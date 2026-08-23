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
export class MaplayError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'MaplayError';
    }
}
export class MaplayClient {
    baseUrl;
    fetchTimeoutMs;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '');
        this.fetchTimeoutMs = options.fetchTimeoutMs ?? 30_000;
    }
    /** True when the maplay HTTP API answers. */
    async health() {
        try {
            const res = await this.fetchJson('/api/tools/list', { method: 'GET' });
            return Array.isArray(res);
        }
        catch {
            return false;
        }
    }
    /** List the tools maplay currently exposes. */
    async listTools() {
        const res = await this.fetchJson('/api/tools/list', { method: 'GET' });
        if (!Array.isArray(res))
            throw new MaplayError('maplay /api/tools/list returned a non-array payload');
        return res;
    }
    /** Invoke one maplay tool. */
    async call(name, args, signal) {
        const res = await this.fetchJson('/api/tools/call', {
            method: 'POST',
            body: JSON.stringify({ tool: name, args: args ?? {} }),
            signal,
        });
        if (res === null || typeof res !== 'object')
            throw new MaplayError('maplay /api/tools/call returned a non-object payload');
        return res;
    }
    /** Fetch the current board snapshot (GET /api/board). */
    async board(signal) {
        const res = await this.fetchJson('/api/board', { method: 'GET', signal });
        if (res === null || typeof res !== 'object')
            throw new MaplayError('maplay /api/board returned a non-object payload');
        return res;
    }
    /**
     * Load a full playground session (map + messages) into the running server.
     * Returns true when the session was accepted.
     */
    async loadSession(session, signal) {
        const res = await this.fetchJson('/api/playground/session', {
            method: 'POST',
            body: JSON.stringify(session),
            signal,
        });
        return res !== null && typeof res === 'object' && 'map' in res;
    }
    /** Shared fetch with timeout + JSON parsing. */
    async fetchJson(path, init) {
        const timeout = AbortSignal.timeout(this.fetchTimeoutMs);
        const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        let res;
        try {
            res = await fetch(`${this.baseUrl}${path}`, {
                method: init.method,
                headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
                body: init.body,
                signal,
            });
        }
        catch (error) {
            const cause = error instanceof Error ? error.message : String(error);
            throw new MaplayError(`maplay request failed (${this.baseUrl}${path}): ${cause}`);
        }
        if (!res.ok) {
            throw new MaplayError(`maplay responded ${res.status} for ${path}`, res.status);
        }
        return await res.json();
    }
}
//# sourceMappingURL=client.js.map