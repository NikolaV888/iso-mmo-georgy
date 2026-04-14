import {
    DEFAULT_HUD_PLAYER,
    DEFAULT_PARTY_STATE,
    buildHotbarEntries,
    createEmptyInventoryState,
    createEmptyQuestState,
    createEmptySkillState,
} from "./data/prototypeData";
import { createElement } from "./dom";
import { ActionBar } from "./components/ActionBar";
import { Hotbar } from "./components/Hotbar";
import { InventoryPanel } from "./components/InventoryPanel";
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
    i: "pack",
    k: "skills",
    l: "quests",
    p: "party",
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
    private actionBar: ActionBar;
    private hotbar: Hotbar;
    private statsPanel: StatsPanel;
    private inventoryPanel: InventoryPanel;
    private partyPanel: PartyPanel;
    private skillPanel: SkillPanel;
    private questPanel: QuestPanel;
    private questTracker: QuestTracker;
    private npcDialogPanel: NpcDialogPanel;
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
        this.statsPanel = new StatsPanel(this.root, callbacks);
        this.inventoryPanel = new InventoryPanel(this.root, callbacks);
        this.partyPanel = new PartyPanel(this.root, callbacks);
        this.skillPanel = new SkillPanel(this.root);
        this.questPanel = new QuestPanel(this.root);
        this.questTracker = new QuestTracker(this.root);
        this.npcDialogPanel = new NpcDialogPanel(this.root, callbacks);

        this.windows = {
            stats: this.statsPanel,
            pack: this.inventoryPanel,
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

        this.topBar.update(this.playerState);
        this.inventoryPanel.setGold(this.playerState.gold);
        this.inventoryPanel.updateInventoryState(this.inventoryState);
        this.refreshDerivedPanels();
        this.syncActionBar();
    }

    public destroy() {
        this.toastFeed.destroy();
        this.root.remove();
    }

    public setLocalSessionId(sessionId: string) {
        this.partyPanel.setLocalSessionId(sessionId);
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
        this.refreshDerivedPanels();
    }

    public updateOnlinePlayers(players: OnlinePlayerData[]) {
        this.onlinePlayers = players
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));
        this.partyPanel.updateOnlinePlayers(this.onlinePlayers);
        this.refreshDerivedPanels();
    }

    public updatePartyState(state: Partial<PartyStateData>) {
        this.partyState = {
            partyId: this.readNullableString(state.partyId, this.partyState.partyId),
            leaderId: this.readNullableString(state.leaderId, this.partyState.leaderId),
            members: Array.isArray(state.members) ? state.members : this.partyState.members,
            invites: Array.isArray(state.invites) ? state.invites : this.partyState.invites,
        };

        this.partyPanel.updatePartyState(this.partyState);
        this.refreshDerivedPanels();
    }

    public updateTarget(target: TargetFrameData | null) {
        this.targetFrame.update(target);
    }

    public updateInventoryState(state: InventoryStateData) {
        this.inventoryState = state;
        this.inventoryPanel.updateInventoryState(this.inventoryState);
        this.refreshDerivedPanels();
    }

    public updateSkillState(state: SkillStateData) {
        this.skillState = state;
        this.refreshDerivedPanels();
    }

    public updateQuestState(state: QuestStateData) {
        this.questState = state;
        this.refreshDerivedPanels();
    }

    public updateNpcDialogState(state: NpcDialogStateData) {
        this.npcDialogPanel.updateState(state);
        this.syncActionBar();
    }

    public showToast(message: string, kind: HudToastKind = "info") {
        this.toastFeed.push(message, kind);
    }

    public toggleWindow(windowId: HudWindowId): boolean {
        const open = this.windows[windowId].toggle();
        this.syncActionBar();
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

    private refreshDerivedPanels() {
        this.skillPanel.updateEntries(this.skillState.skills);
        this.questPanel.updateEntries(this.questState.entries);
        this.questTracker.updateEntries(this.questState.entries);
        this.hotbar.updateEntries(buildHotbarEntries(this.skillState, this.inventoryState));
    }

    private syncActionBar() {
        (Object.keys(this.windows) as HudWindowId[]).forEach((windowId) => {
            this.actionBar.setWindowState(windowId, this.windows[windowId].isOpen());
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
}
