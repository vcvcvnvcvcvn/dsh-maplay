/**
 * maplay tool schemas, converted from maplay's PLAYGROUND_TOOLS into the dsh
 * schema DSL (`@deepseek-ai/dsh-tools` ParameterSchemaSpec).
 *
 * These definitions are the single source of truth for what the agent can
 * call. Names and descriptions are kept identical to maplay so that prompts,
 * sessions, and MCP clients stay interchangeable.
 */
const string = (description) => ({ type: 'string', ...(description !== undefined ? { description } : {}) });
const req = (spec, description) => ({ ...spec, ...(description !== undefined ? { description } : {}), required: true });
export const MAPLAY_TOOL_SPECS = [
    {
        name: 'get_board_info',
        description: 'Get the current board state, including map size, entities, objects, walls, doors, text boxes, coordinates, states, and notes. Call this before planning animations so you use real IDs.',
        parameters: {},
        concurrencySafe: true,
    },
    {
        name: 'rollD20',
        description: 'Roll one d20. The server generates and broadcasts the result. Use it for checks, attacks, or hit resolution.',
        parameters: {
            reason: string('Why the roll is needed, such as a stealth check.'),
        },
        concurrencySafe: true,
    },
    {
        name: 'focus',
        description: 'Focus the camera on a target and optionally change zoom. After the focused beat ends, usually call resetCamera unless the camera should stay there.',
        parameters: {
            target: req(string('Target ID.')),
            zoom: { type: 'number', description: 'Camera zoom value.' },
            duration: { type: 'number', description: 'Animation duration in milliseconds.' },
        },
        concurrencySafe: false,
    },
    {
        name: 'resetCamera',
        description: 'Reset the camera to the default scene center and zoom.',
        parameters: {
            zoom: { type: 'number', description: 'Zoom value after reset.' },
            duration: { type: 'number', description: 'Animation duration in milliseconds.' },
        },
        concurrencySafe: false,
    },
    {
        name: 'moveTo',
        description: 'Smoothly move a target to coordinates or near another entity/object.',
        parameters: {
            target: req(string('Target ID.')),
            x: { type: 'number', description: 'Destination X coordinate.' },
            y: { type: 'number', description: 'Destination Y coordinate.' },
            toTarget: string('Destination target ID. If provided, the target moves near this object instead of using x/y.'),
            speed: { type: 'string', enum: ['slow', 'normal', 'fast'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'walkTo',
        description: 'Walk a target to coordinates or near another entity/object with walking rhythm.',
        parameters: {
            target: req(string('Target ID.')),
            x: { type: 'number', description: 'Destination X coordinate.' },
            y: { type: 'number', description: 'Destination Y coordinate.' },
            toTarget: string('Destination target ID. If provided, the target walks near this object instead of using x/y.'),
            speed: { type: 'string', enum: ['slow', 'normal', 'fast'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'emote',
        description: 'Show text or an emotion above a target.',
        parameters: {
            target: req(string('Target ID.')),
            text: req(string('Text to display.')),
            duration: { type: 'number', description: 'Display duration in milliseconds, for example 3000 means 3 seconds.' },
        },
        concurrencySafe: false,
    },
    {
        name: 'breathe',
        description: 'Enable or disable a breathing animation on a target.',
        parameters: {
            target: req(string('Target ID.')),
            enabled: req({ type: 'boolean' }),
            pace: { type: 'string', enum: ['slow', 'normal', 'fast'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'stateChange',
        description: 'Change the visual state of a target.',
        parameters: {
            target: req(string('Target ID.')),
            state: req({ type: 'string', enum: ['hurt', 'poisoned', 'frozen', 'petrified', 'enraged', 'blessed', 'custom'] }),
            color: string(),
            duration: { type: 'number' },
        },
        concurrencySafe: false,
    },
    {
        name: 'shoot',
        description: 'Make an attacker fire a gunshot or arrow-like projectile at a target. Uses a trail by default. For fire breath, magic, energy waves, emoji projectiles, or text projectiles, prefer flyTo.',
        parameters: {
            attacker: req(string('Attacker entity ID.')),
            target: req(string('Target ID.')),
            result: req({ type: 'string', enum: ['hit', 'dodge', 'block'] }),
            hitEffect: { type: 'string', enum: ['shake', 'tilt', 'knockback', 'none'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'flyTo',
        description: 'Launch flying content. Use this for fire breath, magic bolts, energy waves, runes, emoji projectiles, text projectiles, and other non-gun effects.',
        parameters: {
            contentValue: req(string('Projectile content, such as text or an emoji.')),
            fromX: req({ type: 'number' }),
            fromY: req({ type: 'number' }),
            toTarget: string('Target ID. If provided, the projectile flies to this object and applies light physical feedback on hit.'),
            toX: { type: 'number' },
            toY: { type: 'number' },
            speed: { type: 'string', enum: ['slow', 'normal', 'fast'] },
            trail: { type: 'boolean', description: 'Whether to show a trail.' },
        },
        concurrencySafe: false,
    },
    {
        name: 'knockback',
        description: 'Make an attacker knock a target backward.',
        parameters: {
            attacker: req(string()),
            target: req(string()),
            force: { type: 'string', enum: ['light', 'normal', 'heavy'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'shove',
        description: 'Push a target forward.',
        parameters: {
            attacker: req(string()),
            target: req(string()),
            distance: { type: 'number' },
            speed: { type: 'string', enum: ['slow', 'normal'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'grab',
        description: 'Grab a target and carry it to a specified position.',
        parameters: {
            attacker: req(string()),
            target: req(string()),
            x: req({ type: 'number' }),
            y: req({ type: 'number' }),
            speed: { type: 'string', enum: ['slow', 'normal'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'equip',
        description: 'Add a held item to a target entity.',
        parameters: {
            target: req(string('Target entity ID.')),
            slot: req({ type: 'string', enum: ['left', 'right'] }),
            itemValue: req(string('Displayed item content, such as an emoji.')),
            itemType: { type: 'string', enum: ['emoji', 'image'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'clearEquipment',
        description: 'Remove a held item from a target entity slot.',
        parameters: {
            target: req(string('Target entity ID.')),
            slot: req({ type: 'string', enum: ['left', 'right'] }),
        },
        concurrencySafe: false,
    },
    {
        name: 'swingEquipment',
        description: 'Swing the equipment held by a target entity.',
        parameters: {
            target: req(string('Target entity ID.')),
            slot: { type: 'string', enum: ['left', 'right'] },
            angle: { type: 'number' },
            duration: { type: 'number' },
        },
        concurrencySafe: false,
    },
    {
        name: 'removeElement',
        description: 'Remove a target from the scene with an exit animation.',
        parameters: {
            target: string(),
            exit: { type: 'string', enum: ['fade', 'shrink', 'explode', 'flyAway', 'instant'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'changeAppearance',
        description: 'Change the appearance of a target.',
        parameters: {
            target: string(),
            appearanceValue: string(),
            appearanceType: { type: 'string', enum: ['emoji', 'image'] },
            transition: { type: 'string', enum: ['instant', 'crossfade', 'flash'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'addEntity',
        description: 'Add a new entity to the scene.',
        parameters: {
            id: string(),
            name: string(),
            x: { type: 'number' },
            y: { type: 'number' },
            appearanceValue: string(),
        },
        concurrencySafe: false,
    },
    {
        name: 'earthquake',
        description: 'Trigger a global earthquake effect.',
        parameters: {
            intensity: { type: 'string', enum: ['light', 'normal', 'heavy'] },
            duration: { type: 'number' },
        },
        concurrencySafe: false,
    },
    {
        name: 'transition',
        description: 'Trigger a scene transition.',
        parameters: {
            type: req({ type: 'string', enum: ['flashWhite', 'fadeBlack', 'fadeIn', 'fadeOut'] }),
            duration: { type: 'number' },
        },
        concurrencySafe: false,
    },
    {
        name: 'addDoor',
        description: 'Add a door to a specified wall.',
        parameters: {
            id: string(),
            wallId: string(),
            position: { type: 'number' },
            width: { type: 'number' },
        },
        concurrencySafe: false,
    },
    {
        name: 'removeDoor',
        description: 'Remove a specified door.',
        parameters: {
            target: string(),
            exit: { type: 'string', enum: ['fade', 'instant'] },
        },
        concurrencySafe: false,
    },
    {
        name: 'openDoor',
        description: 'Open a specified door.',
        parameters: {
            target: string(),
        },
        concurrencySafe: false,
    },
    {
        name: 'closeDoor',
        description: 'Close a specified door.',
        parameters: {
            target: string(),
        },
        concurrencySafe: false,
    },
    {
        name: 'jump',
        description: 'Make a target jump.',
        parameters: {
            target: req(string('Target ID.')),
            height: { type: 'number' },
            duration: { type: 'number' },
        },
        concurrencySafe: false,
    },
    {
        name: 'setNote',
        description: 'Update the note for an entity, object, wall, door, marker, or text box.',
        parameters: {
            target: string(),
            note: string(),
        },
        concurrencySafe: false,
    },
    {
        name: 'explodeEntity',
        description: 'Remove a target with an explosion exit.',
        parameters: {
            target: string(),
        },
        concurrencySafe: false,
    },
];
/** All maplay tool names, in registration order. */
export const MAPLAY_TOOL_NAMES = MAPLAY_TOOL_SPECS.map((spec) => spec.name);
//# sourceMappingURL=schemas.js.map