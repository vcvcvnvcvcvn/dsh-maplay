/**
 * maplay server lifecycle: optionally spawn the maplay Vite dev server as a
 * child process, wait for its HTTP API to answer, and tear it down on plugin
 * dispose. When an external maplay server is already running at `baseUrl`,
 * spawning is skipped entirely.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
/** Best available `vite` executable inside the maplay checkout. */
function resolveViteBin(maplayDir) {
    const candidates = [
        join(maplayDir, 'node_modules', '.bin', 'vite'),
    ];
    return candidates.find((candidate) => existsSync(candidate));
}
/**
 * Ensure a healthy maplay server. Returns `{ spawned: false }` when one is
 * already reachable; otherwise spawns `vite` inside `maplayDir` and waits for
 * the API to answer.
 */
export async function ensureMaplayServer(client, options) {
    if (await client.health()) {
        return { spawned: false };
    }
    const viteBin = resolveViteBin(options.maplayDir);
    if (viteBin === undefined) {
        throw new Error(`dsh-maplay: no healthy maplay server at ${client.baseUrl} and no vite binary found ` +
            `in ${options.maplayDir}/node_modules/.bin. Run "npm install" in the maplay checkout, ` +
            `or start maplay yourself and point baseUrl at it.`);
    }
    const args = ['--host', options.host, '--port', String(options.port)];
    if (options.base !== undefined && options.base.length > 0)
        args.push('--base', options.base);
    const proc = spawn(viteBin, args, {
        cwd: options.maplayDir,
        stdio: 'ignore',
        env: process.env,
    });
    const deadline = Date.now() + options.startupTimeoutMs;
    const pollInterval = options.pollIntervalMs ?? 500;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (await client.health())
            return { proc, spawned: true };
        if (proc.exitCode !== null || proc.signalCode !== null) {
            // vite exited before becoming healthy
            void proc;
            throw new Error(`dsh-maplay: vite exited (code=${proc.exitCode ?? '?'}) before its API became healthy at ${client.baseUrl}`);
        }
        if (Date.now() > deadline) {
            proc.kill('SIGTERM');
            throw new Error(`dsh-maplay: timed out after ${options.startupTimeoutMs}ms waiting for maplay at ${client.baseUrl}`);
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
}
/** Stop a spawned maplay process, best-effort. */
export function stopMaplayServer(proc) {
    if (proc === undefined || proc.exitCode !== null)
        return;
    try {
        proc.kill('SIGTERM');
    }
    catch {
        // already gone
    }
}
//# sourceMappingURL=spawn.js.map