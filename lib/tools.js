/**
 * Registers the maplay tools into `ctx.tools` (dsh's model-facing tool
 * registry). Every call is bridged to the running maplay server over HTTP; the
 * agent loop, approval pipeline, timeouts, and session logging all belong to
 * dsh, while the actual scene mutations happen in maplay.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { MAPLAY_TOOL_SPECS } from './schemas.js';
/** Extract a short label for one placed item, e.g. `Toby(entity-tortoise)`. */
function itemLabel(item) {
    const id = typeof item.id === 'string' ? item.id : '?';
    const name = typeof item.name === 'string' && item.name.length > 0 ? item.name : undefined;
    const text = typeof item.text === 'string' && item.text.length > 0 ? item.text : undefined;
    return name !== undefined ? `${name}(${id})` : text !== undefined ? `${text}(${id})` : id;
}
/** Render a board snapshot as a compact, model-friendly text block. */
export function formatBoard(board, maxChars) {
    const parts = [];
    const counts = board.counts ?? {};
    const header = [
        board.mapName !== undefined ? `Map: ${board.mapName}` : 'Map',
        board.gridSize !== undefined ? `grid=${JSON.stringify(board.gridSize)}` : undefined,
    ].filter((part) => part !== undefined);
    const countLine = Object.entries(counts)
        .filter(([, n]) => typeof n === 'number' && n > 0)
        .map(([key, n]) => `${key}=${n}`)
        .join(' ');
    parts.push(`${header.join(' ')}${countLine.length > 0 ? ` (${countLine})` : ''}`);
    const groups = [
        ['Entities', board.entities],
        ['SceneObjects', board.sceneObjects],
        ['TextBoxes', board.textBoxes],
    ];
    for (const [label, items] of groups) {
        if (items === undefined || items.length === 0)
            continue;
        const line = items.map((item) => {
            const label1 = itemLabel(item);
            const pos = item.position;
            const grid = Array.isArray(pos?.grid) ? pos.grid.map((n) => Math.round(n)).join(',') : undefined;
            const note = typeof item.note === 'string' && item.note.length > 0 ? ` note="${item.note}"` : '';
            return `${label1}${grid !== undefined ? `@(${grid})` : ''}${note}`;
        }).join(' ');
        parts.push(`${label}: ${line}`);
    }
    const walls = board.walls ?? [];
    const markers = board.markers ?? [];
    const doors = board.doors ?? [];
    if (walls.length > 0)
        parts.push(`Walls: ${walls.length}`);
    if (markers.length > 0)
        parts.push(`Markers: ${markers.map((m) => m.label ?? '?').join(', ')}`);
    if (doors.length > 0) {
        parts.push(`Doors: ${doors.map((d) => {
            const door = d;
            return `${door.id ?? '?'}(${door.state ?? 'closed'})`;
        }).join(', ')}`);
    }
    const text = parts.join('\n');
    return text.length > maxChars ? `${text.slice(0, maxChars)}\n…(truncated)` : text;
}
/** Render one maplay tool result as the model-facing text block. */
export function formatResult(value, maxBoardChars) {
    if (value === null || typeof value !== 'object')
        return String(value);
    const result = value;
    const lines = [];
    if (result.ok) {
        lines.push(`maplay: ${result.summary}`);
        if (result.board !== undefined && result.board !== null) {
            lines.push(formatBoard(result.board, maxBoardChars));
        }
    }
    else {
        lines.push(`maplay error: ${result.error ?? result.summary ?? 'unknown failure'}`);
    }
    return lines.join('\n');
}
/** Pending-call card shown while a maplay tool runs. */
export function presentMaplayCall(spec, args) {
    const target = typeof args.target === 'string'
        ? args.target
        : typeof args.attacker === 'string'
            ? `attacker=${args.attacker}`
            : undefined;
    return {
        card: 'generic',
        title: target !== undefined ? `${spec.name} → ${target}` : spec.name,
        kind: 'other',
        rawInput: JSON.stringify(args),
    };
}
/**
 * Register each configured maplay tool. Registrations are effect-scoped: they
 * unregister automatically when the plugin fiber is disposed.
 */
export function registerMaplayTools(ctx, executor, options) {
    const prefix = options.prefix ?? '';
    const timeoutMs = options.timeoutMs ?? 30_000;
    const maxBoardChars = options.maxBoardChars ?? 12_000;
    const enabled = options.enabledTools !== undefined
        ? new Set(options.enabledTools)
        : undefined;
    let registered = 0;
    for (const spec of MAPLAY_TOOL_SPECS) {
        if (enabled !== undefined && !enabled.has(spec.name))
            continue;
        const exposedName = `${prefix}${spec.name}`;
        ctx.tools.register(defineTool({
            name: exposedName,
            description: spec.description,
            parameters: spec.parameters,
            output: {
                schema: { type: 'object', additionalProperties: true },
                render: (_args, value) => [{ type: 'text', text: formatResult(value, maxBoardChars) }],
            },
            timeoutMs,
            // Reading the board is read-only; every mutation serializes through the
            // maplay action queue, so concurrent mutating calls are unsafe.
            isConcurrencySafe: () => spec.concurrencySafe,
            async execute(args, exec) {
                // Per-session scenes: the calling agent's id selects its own map state.
                const sessionId = exec.agent?.id;
                const result = await executor.call(spec.name, args, exec.signal, sessionId);
                return result;
            },
            presentCall: (args) => presentMaplayCall(spec, args),
        }));
        registered += 1;
    }
    return registered;
}
//# sourceMappingURL=tools.js.map