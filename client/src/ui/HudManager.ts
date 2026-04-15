import {
    DEFAULT_HUD_PLAYER,
    DEFAULT_PARTY_STATE,
    buildHotbarEntries,
    createEmptyInventoryState,
    createEmptyQuestState,
    createEmptySkillState,
} from "./data/prototypeData";
import { createElement } from "./dom";
import { HudLayoutManager } from "./HudLayoutManager";
import { ActionBar } from "./components/ActionBar";
import { ChatBox } from "./components/ChatBox";
import { EquipmentPanel } from "./components/EquipmentPanel";
import { Hotbar } from "./components/Hotbar";
import { InventoryPanel } from "./components/InventoryPanel";
import { ItemTooltip } from "./components/ItemTooltip";
import { NpcDialogPanel } from "./components/NpcDialogPanel";
import { PartyPanel } from "./components/PartyPanel";
import { QuestPanel } from "./components/QuestPanel";
import { QuestTracker } from "./components/QuestTracker";
import { SkillPanel } from "./components/SkillPanel";
import { StatsPanel } from "./components/StatsPanel";
import { TargetFrame } from "./components/TargetFrame";
import { ToastFeed } from "./components/ToastFeed";
import { TopBar } from "./components/TopBar";
import type {
    HudCallbacks,
    ChatLogEntryData,
    HudPlayerData,
    HotbarActionId,
    HudToastKind,
    HudWindowId,
    InventoryStateData,
    NpcDialogStateData,
    OnlinePlayerData,
    PartyStateData,
    QuestStateData,
    SkillStateData,
    TargetFrameData,
} from "./types";

interface WindowSurface {
    isOpen(): boolean;
    toggle(): boolean;
    setOpen(open: boolean): boolean;
}

const HOTKEY_TO_WINDOW: Record<string, HudWindowId> = {
    c: "stats",
    e: "equipment",
    i: "pack",
    k: "skills",
    l: "quests",
    p: "party",
};

const WINDOW_SURFACE_IDS: Record<HudWindowId, string> = {
    stats: "stats-panel",
    pack: "inventory-panel",
    equipment: "equipment-panel",
    party: "party-panel",
    skills: "skill-panel",
    quests: "quest-panel",
    npc: "npc-dialog-panel",
};

export class HudManager {
    private root: HTMLDivElement;
    private callbacks: HudCallbacks;
    private playerState: HudPlayerData = { ...DEFAULT_HUD_PLAYER };
    private partyState: PartyStateData = { ...DEFAULT_PARTY_STATE };
    private inventoryState: InventoryStateData = createEmptyInventoryState();
    private skillState: SkillStateData = createEmptySkillState();
    private questState: QuestStateData = createEmptyQuestState();
    private onlinePlayers: OnlinePlayerData[] = [];

    private topBar: TopBar;
    private targetFrame: TargetFrame;
    private toastFeed: ToastFeed;
    private itemTooltip: ItemTooltip;
    private chatBox: ChatBox;
    private actionBar: ActionBar;
    private hotbar: Hotbar;
    private statsPanel: StatsPanel;
    private inventoryPanel: InventoryPanel;
    private equipmentPanel: EquipmentPanel;
    private partyPanel: PartyPanel;
    private skillPanel: SkillPanel;
    private questPanel: QuestPanel;
    private questTracker: QuestTracker;
    private npcDialogPanel: NpcDialogPanel;
    private layoutManager: HudLayoutManager;
    private readonly stateSignatures = new Map<string, string>();
    private windows: Record<HudWindowId, WindowSurface>;

    constructor(callbacks: HudCallbacks = {}) {
        document.getElementById("hud-root")?.remove();
        this.callbacks = callbacks;

        this.root = createElement("div", "hud-root");
        this.root.id = "hud-root";
        document.body.append(this.root);

        this.topBar = new TopBar(this.root);
        this.targetFrame = new TargetFrame(this.root);
        this.toastFeed = new ToastFeed(this.root);
        this.itemTooltip = new ItemTooltip(this.root);
        this.chatBox = new ChatBox(this.root, callbacks);
        this.statsPanel = new StatsPanel(this.root, callbacks);
        this.inventoryPanel = new InventoryPanel(this.root, callbacks, this.itemTooltip);
        this.equipmentPanel = new EquipmentPanel(this.root, callbacks, this.itemTooltip);
        this.partyPanel = new PartyPanel(this.root, callbacks);
        this.skillPanel = new SkillPanel(this.root);
        this.questPanel = new QuestPanel(this.root);
        this.questTracker = new QuestTracker(this.root);
        this.npcDialogPanel = new NpcDialogPanel(this.root, callbacks);

        this.windows = {
            stats: this.statsPanel,
            pack: this.inventoryPanel,
            equipment: this.equipmentPanel,
            party: this.partyPanel,
            skills: this.skillPanel,
            quests: this.questPanel,
            npc: this.npcDialogPanel,
        };

        this.actionBar = new ActionBar(this.root, (windowId) => {
            this.toggleWindow(windowId);
        });
        this.hotbar = new Hotbar(this.root, (actionId) => {
            this.triggerHotbarAction(actionId);
        });
        this.layoutManager = new HudLayoutManager();

        this.topBar.update(this.playerState);
        this.inventoryPanel.setGold(this.playerState.gold);
        this.inventoryPanel.updateInventoryState(this.inventoryState);
        this.equipmentPanel.updateInventoryState(this.inventoryState);
        this.skillPanel.updateEntries(this.skillState.skills);
        this.questPanel.updateEntries(this.questState.entries);
        this.questTracker.updateEntries(this.questState.entries);
        this.hotbar.updateEntries(buildHotbarEntries(this.skillState, this.inventoryState));
        this.syncActionBar();
        this.registerDraggableSurfaces();
    }

    public destroy() {
        this.chatBox.destroy();
        this.layoutManager.destroy();
        this.toastFeed.destroy();
        this.root.remove();
    }

    public setLocalSessionId(sessionId: string) {
        this.partyPanel.setLocalSessionId(sessionId);
    }

    public focusChatInput() {
        this.chatBox.focusInput();
    }

    public blurChatInput() {
        this.chatBox.blurInput();
    }

    public isChatFocused(): boolean {
        return this.chatBox.isFocused();
    }

    public setChatWhisperTarget(name: string | null) {
        this.chatBox.setWhisperTarget(name);
    }

    public addChatEntry(entry: ChatLogEntryData) {
        this.chatBox.addEntry(entry);
    }

    public updateLocalPlayer(player: Partial<HudPlayerData>) {
        this.playerState = {
            name: this.readString(player.name, this.playerState.name),
            level: this.readNumber(player.level, this.playerState.level),
            exp: this.readNumber(player.exp, this.playerState.exp),
            expToNextLevel: this.readNumber(player.expToNextLevel, this.playerState.expToNextLevel),
            gold: this.readNumber(player.gold, this.playerState.gold),
            bonusStatPoints: this.readNumber(player.bonusStatPoints, this.playerState.bonusStatPoints),
            hp: this.readNumber(player.hp, this.playerState.hp),
            maxHp: this.readNumber(player.maxHp, this.playerState.maxHp),
            str: this.readNumber(player.str, this.playerState.str),
            agi: this.readNumber(player.agi, this.playerState.agi),
            int: this.readNumber(player.int, this.playerState.int),
            vit: this.readNumber(player.vit, this.playerState.vit),
            attackDamage: this.readNumber(player.attackDamage, this.playerState.attackDamage),
            attackSpeed: this.readNumber(player.attackSpeed, this.playerState.attackSpeed),
            moveSpeed: this.readNumber(player.moveSpeed, this.playerState.moveSpeed),
        };

        this.topBar.update(this.playerState);
        this.statsPanel.update(this.playerState);
        this.inventoryPanel.setGold(this.playerState.gold);
    }

    public updateOnlinePlayers(players: OnlinePlayerData[]) {
        const nextPlayers = players
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));
        if (this.shouldSkipStateUpdate("onlinePlayers", nextPlayers)) return;

        this.onlinePlayers = nextPlayers;
        this.partyPanel.updateOnlinePlayers(this.onlinePlayers);
    }

    public updatePartyState(state: Partial<PartyStateData>) {
        const nextState: PartyStateData = {
            partyId: this.readNullableString(state.partyId, this.partyState.partyId),
            leaderId: this.readNullableString(state.leaderId, this.partyState.leaderId),
            members: Array.isArray(state.members) ? state.members : this.partyState.members,
            invites: Array.isArray(state.invites) ? state.invites : this.partyState.invites,
        };
        if (this.shouldSkipStateUpdate("partyState", nextState)) return;

        this.partyState = nextState;
        this.partyPanel.updatePartyState(this.partyState);
    }

    public updateTarget(target: TargetFrameData | null) {
        if (this.shouldSkipStateUpdate("target", target)) return;
        this.targetFrame.update(target);
    }

    public updateInventoryState(state: InventoryStateData) {
        if (this.shouldSkipStateUpdate("inventoryState", state)) return;
        this.inventoryState = state;
        this.inventoryPanel.updateInventoryState(this.inventoryState);
        this.equipmentPanel.updateInventoryState(this.inventoryState);
        this.syncHotbar();
    }

    public updateSkillState(state: SkillStateData) {
        if (this.shouldSkipStateUpdate("skillState", state)) return;
        this.skillState = state;
        this.skillPanel.updateEntries(this.skillState.skills);
        this.syncHotbar();
    }

    public updateQuestState(state: QuestStateData) {
        if (this.shouldSkipStateUpdate("questState", state)) return;
        this.questState = state;
        this.questPanel.updateEntries(this.questState.entries);
        this.questTracker.updateEntries(this.questState.entries);
    }

    public updateNpcDialogState(state: NpcDialogStateData) {
        if (this.shouldSkipStateUpdate("npcDialogState", state)) return;
        this.npcDialogPanel.updateState(state);
        this.syncActionBar();
        if (state.isOpen) {
            this.layoutManager.promoteSurface("npc-dialog-panel");
        }
    }

    public showToast(message: string, kind: HudToastKind = "info") {
        this.toastFeed.push(message, kind);
    }

    public toggleWindow(windowId: HudWindowId): boolean {
        const open = this.windows[windowId].toggle();
        this.syncActionBar();
        if (open) {
            this.layoutManager.promoteSurface(WINDOW_SURFACE_IDS[windowId]);
        }
        return open;
    }

    public closeAllWindows(): boolean {
        let closedAny = false;

        Object.values(this.windows).forEach((window) => {
            if (!window.isOpen()) return;
            window.setOpen(false);
            closedAny = true;
        });

        if (closedAny) this.syncActionBar();
        return closedAny;
    }

    public handleWindowHotkey(key: string): boolean {
        const windowId = HOTKEY_TO_WINDOW[key.toLowerCase()];
        if (!windowId) return false;
        this.toggleWindow(windowId);
        return true;
    }

    public handleHotbarKey(key: string): boolean {
        return this.hotbar.triggerByKey(key) !== null;
    }

    private syncHotbar() {
        this.hotbar.updateEntries(buildHotbarEntries(this.skillState, this.inventoryState));
    }

    private syncActionBar() {
        (Object.keys(this.windows) as HudWindowId[]).forEach((windowId) => {
            this.actionBar.setWindowState(windowId, this.windows[windowId].isOpen());
        });
    }

    private registerDraggableSurfaces() {
        this.layoutManager.registerSurface({
            id: "topbar",
            element: this.topBar.getRootElement(),
            layer: 140,
        });
        this.layoutManager.registerSurface({
            id: "target-frame",
            element: this.targetFrame.getRootElement(),
            layer: 150,
        });
        this.layoutManager.registerSurface({
            id: "toast-feed",
            element: this.toastFeed.getRootElement(),
            layer: 160,
        });
        this.layoutManager.registerSurface({
            id: "chat-box",
            element: this.chatBox.getRootElement(),
            handle: this.chatBox.getDragHandleElement(),
            layer: 130,
        });
        this.layoutManager.registerSurface({
            id: "action-bar",
            element: this.actionBar.getRootElement(),
            layer: 100,
        });
        this.layoutManager.registerSurface({
            id: "hotbar",
            element: this.hotbar.getRootElement(),
            layer: 110,
        });
        this.layoutManager.registerSurface({
            id: "quest-tracker",
            element: this.questTracker.getRootElement(),
            layer: 145,
        });
        this.layoutManager.registerSurface({
            id: "stats-panel",
            element: this.statsPanel.getRootElement(),
            handle: this.statsPanel.getDragHandleElement(),
            layer: 300,
        });
        this.layoutManager.registerSurface({
            id: "inventory-panel",
            element: this.inventoryPanel.getRootElement(),
            handle: this.inventoryPanel.getDragHandleElement(),
            layer: 300,
        });
        this.layoutManager.registerSurface({
            id: "equipment-panel",
            element: this.equipmentPanel.getRootElement(),
            handle: this.equipmentPanel.getDragHandleElement(),
            layer: 300,
        });
        this.layoutManager.registerSurface({
            id: "party-panel",
            element: this.partyPanel.getRootElement(),
            handle: this.partyPanel.getDragHandleElement(),
            layer: 300,
        });
        this.layoutManager.registerSurface({
            id: "skill-panel",
            element: this.skillPanel.getRootElement(),
            handle: this.skillPanel.getDragHandleElement(),
            layer: 300,
        });
        this.layoutManager.registerSurface({
            id: "quest-panel",
            element: this.questPanel.getRootElement(),
            handle: this.questPanel.getDragHandleElement(),
            layer: 300,
        });
        this.layoutManager.registerSurface({
            id: "npc-dialog-panel",
            element: this.npcDialogPanel.getRootElement(),
            handle: this.npcDialogPanel.getDragHandleElement(),
            layer: 320,
        });
    }

    private triggerHotbarAction(actionId: HotbarActionId) {
        switch (actionId) {
            case "pack-panel":
                this.toggleWindow("pack");
                return;
            case "use-potion": {
                const potionIndex = this.inventoryState.tabs.use.findIndex((item) => item.id === "red-potion");
                if (potionIndex >= 0) {
                    this.callbacks.onUseInventoryItem?.("use", potionIndex);
                } else {
                    this.showToast("No red potions left.", "error");
                }
                return;
            }
            default:
                this.callbacks.onTriggerHotbarAction?.(actionId);
        }
    }

    private readNumber(value: unknown, fallback: number): number {
        return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    }

    private readString(value: unknown, fallback: string): string {
        return typeof value === "string" && value.trim() ? value : fallback;
    }

    private readNullableString(value: unknown, fallback: string | null): string | null {
        return typeof value === "string" && value.trim() ? value : fallback;
    }

    private shouldSkipStateUpdate(key: string, value: unknown): boolean {
        const signature = JSON.stringify(value);
        if (this.stateSignatures.get(key) === signature) {
            return true;
        }

        this.stateSignatures.set(key, signature);
        return false;
    }
}
