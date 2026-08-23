/**
 * Per-session scene storage: every dsh session (agent conversation) owns its
 * own map state — map document, animation queue, and chat transcript — so two
 * sessions driving maplay never see each other's moves.
 *
 * The HTTP/web channel (playground page, curl) uses the reserved `default`
 * key; agent tool calls use the calling agent's sessionId. Tool execution is
 * the same pure maplay logic as before, just keyed per scene instead of one
 * process-wide singleton.
 */
import { type HighLevelDefinition, type MapDocument, type OssConversationMessage } from '@vcvcvn/maplay';
/** The reserved scene key for non-agent callers (web pages, HTTP, curl). */
export declare const DEFAULT_SCENE = "default";
/** One isolated scene: map + pending animations + transcript. */
export interface SceneState {
    map: MapDocument;
    messages: OssConversationMessage[];
    actionQueue: Array<{
        nonce: number;
        requestId: string;
        action: HighLevelDefinition;
    }>;
    updatedAt: number;
}
export interface SceneToolResult {
    ok: boolean;
    summary: string;
    applied?: unknown;
    board?: unknown;
    error?: string;
    [key: string]: unknown;
}
type SceneSubscriber = (sceneKey: string, state: SceneState) => void;
/** Load a raw map document into a fresh scene state. */
export declare function createSceneState(map: unknown): SceneState;
/**
 * In-process per-session scene store. Also owns the notification fan-out used
 * by the /api/playground/session/events SSE stream.
 */
export declare class SceneStore {
    private scenes;
    private readonly initialMap;
    private subscribers;
    constructor(initialMap: unknown);
    /** The scene for a key, created lazily from the initial map on first touch. */
    get(key: string): SceneState;
    /** Replace a scene entirely (e.g. map upload via HTTP). */
    set(key: string, state: SceneState): SceneState;
    /** True when the key has been touched at least once. */
    has(key: string): boolean;
    /** Drop a scene (session teardown); no-op when absent. */
    delete(key: string): void;
    /** Execute one maplay tool against a scene, mutating its map/queue/transcript. */
    executeTool(key: string, toolName: string, args: Record<string, unknown>): Promise<SceneToolResult>;
    /** Acknowledge the head of a scene's animation queue (playground playback). */
    acknowledgeAction(key: string, requestId: string): boolean;
    /** Board snapshot for one scene (lazily initializes it from the seed map). */
    board(key: string): {
        ok: boolean;
        board?: unknown;
        error?: string;
    };
    /** Subscribe to state changes for one scene; returns the unsubscribe. */
    subscribe(key: string, callback: SceneSubscriber): () => void;
    private notify;
}
export {};
//# sourceMappingURL=scene-store.d.ts.map