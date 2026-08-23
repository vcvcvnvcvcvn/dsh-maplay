/**
 * maplay server lifecycle: optionally spawn the maplay Vite dev server as a
 * child process, wait for its HTTP API to answer, and tear it down on plugin
 * dispose. When an external maplay server is already running at `baseUrl`,
 * spawning is skipped entirely.
 */
import { type ChildProcess } from 'node:child_process';
import type { MaplayClient } from './client.js';
export interface MaplaySpawnOptions {
    /** Absolute path to the maplay checkout (must contain package.json). */
    maplayDir: string;
    /** Host to bind, e.g. 127.0.0.1. */
    host: string;
    /** Port to bind. */
    port: number;
    /** Vite `base` (e.g. `/maplay/`) so emitted asset URLs match the dsh web mount. Pass '' for maplay's default. */
    base?: string;
    /** How long to wait for the server to become healthy (ms). */
    startupTimeoutMs: number;
    /** Poll interval while waiting (ms). */
    pollIntervalMs?: number;
}
export interface MaplaySpawnResult {
    /** The spawned child process, when this plugin started it. */
    proc?: ChildProcess;
    /** True when the process was spawned by this plugin instance. */
    spawned: boolean;
}
/**
 * Ensure a healthy maplay server. Returns `{ spawned: false }` when one is
 * already reachable; otherwise spawns `vite` inside `maplayDir` and waits for
 * the API to answer.
 */
export declare function ensureMaplayServer(client: MaplayClient, options: MaplaySpawnOptions): Promise<MaplaySpawnResult>;
/** Stop a spawned maplay process, best-effort. */
export declare function stopMaplayServer(proc: ChildProcess | undefined): void;
//# sourceMappingURL=spawn.d.ts.map