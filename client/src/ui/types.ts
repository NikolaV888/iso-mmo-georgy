export type AllocatableStat = "str" | "agi" | "int" | "vit";
export type InventoryTab = "equip" | "use" | "etc" | "cash";
export type HudWindowId =
    | "stats"
    | "pack"
    | "equipment"
    | "party"
    | "skills"
    | "quests"
    | "npc";
export type HudToastKind = "info" | "error" | "reward";
export type InventoryItemKind = "equipment" | "consumable" | "material" | "cash";
export type HudChatChannel = "say" | "party" | "whisper" | "system";
export type HudChatTone = "neutral" | "error" | "reward";
export type EquipmentSlot =
    | "weapon"
    | "head"
    | "chest"
    | "hands"
    | "feet"
    | "accessory";
export type SkillId = "power-strike" | "rising-uppercut" | "guardian-pulse";
export type HotbarActionId =
    | SkillId
    | "use-potion"
    | "clear-target"
    | "pack-panel";

export interface HudPlayerData {
    name: string;
    level: number;
    exp: number;
    expToNextLevel: number;
    gold: number;
    bonusStatPoints: number;
    hp: number;
    maxHp: number;
    str: number;
    agi: number;
    int: number;
    vit: number;
    attackDamage: number;
    attackSpeed: number;
    moveSpeed: number;
    pvpEnabled: boolean;
    pvpTagged: boolean;
}

export interface OnlinePlayerData {
    sessionId: string;
    name: string;
    level: number;
}

export interface PartyMemberData {
    sessionId: string;
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    isLeader: boolean;
}

export interface PartyInviteData {
    partyId: string;
    leaderId: string;
    leaderName: string;
}

export interface PartyStateData {
    partyId: string | null;
    leaderId: string | null;
    members: PartyMemberData[];
    invites: PartyInviteData[];
}

export interface InventoryItem {
    id: string;
    name: string;
    count: number;
    description: string;
    kind: InventoryItemKind;
    rarity?: "common" | "uncommon" | "rare";
    equipSlot?: EquipmentSlot;
    statLine?: string;
    hotbarEligible?: boolean;
}

export type EquipmentLoadout = Partial<Record<EquipmentSlot, InventoryItem>>;

export interface InventoryStateData {
    tabs: Record<InventoryTab, InventoryItem[]>;
    equipment: EquipmentLoadout;
}

export interface SkillEntryData {
    id: SkillId;
    name: string;
    category: string;
    hotkey: string;
    description: string;
    status: string;
    unlocked: boolean;
    ready: boolean;
    cooldownRemainingMs: number;
    targeting: "target" | "self";
}

export interface SkillStateData {
    skills: SkillEntryData[];
}

export interface HotbarEntryData {
    id: HotbarActionId;
    label: string;
    shortLabel: string;
    hotkey: string;
    description: string;
    status: string;
    category: "combat" | "utility";
    ready: boolean;
}

export interface QuestObjectiveData {
    label: string;
    complete: boolean;
}

export type QuestPhase = "available" | "active" | "ready" | "completed";

export interface QuestEntryData {
    id: string;
    title: string;
    phase: QuestPhase;
    status: string;
    summary: string;
    objectives: QuestObjectiveData[];
    rewardText: string;
}

export interface QuestStateData {
    entries: QuestEntryData[];
}

export interface ChatLogEntryData {
    channel: HudChatChannel;
    author: string;
    text: string;
    tone: HudChatTone;
}

export interface NpcShopItemData {
    itemId: string;
    name: string;
    description: string;
    price: number;
    canAfford: boolean;
}

export interface NpcSellItemData {
    tab: InventoryTab;
    index: number;
    itemId: string;
    name: string;
    count: number;
    priceEach: number;
    totalPrice: number;
}

export interface NpcQuestOfferData {
    questId: string;
    title: string;
    summary: string;
    status: string;
    action: "accept" | "claim" | null;
    actionLabel: string | null;
    canAct: boolean;
}

export interface NpcDialogStateData {
    isOpen: boolean;
    npcId: string | null;
    npcName: string;
    greeting: string;
    hint: string;
    quest: NpcQuestOfferData | null;
    shopItems: NpcShopItemData[];
    sellItems: NpcSellItemData[];
}

export interface TargetFrameData {
    sessionId: string;
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    isMob: boolean;
    mobKind: string;
    pvpEnabled: boolean;
    pvpTagged: boolean;
}

export interface DuelStakeData {
    gold: number;
    itemId: string | null;
    itemName: string | null;
}

export interface IncomingDuelData {
    challengerId: string;
    challengerName: string;
    offeredStake: DuelStakeData;
}

export interface OutgoingDuelData {
    targetId: string;
    targetName: string;
    offeredStake: DuelStakeData;
}

export interface ActiveDuelData {
    opponentId: string;
    opponentName: string;
    yourStake: DuelStakeData;
    opponentStake: DuelStakeData;
}

export interface PvpStateData {
    pvpEnabled: boolean;
    pvpTagged: boolean;
    incomingChallenge: IncomingDuelData | null;
    outgoingChallenge: OutgoingDuelData | null;
    activeDuel: ActiveDuelData | null;
}

export interface DuelStakeSelectionData {
    gold: number;
    tab?: InventoryTab;
    index?: number;
}

export interface PlayerContextTargetData {
    sessionId: string;
    name: string;
    level: number;
}

export interface HudCallbacks {
    onAllocateStat?: (stat: AllocatableStat) => void;
    onTogglePvpMode?: () => void;
    onCreateParty?: () => void;
    onInviteParty?: (targetId: string) => void;
    onWhisperPlayerTarget?: (targetId: string) => void;
    onKickParty?: (targetId: string) => void;
    onLeaveParty?: () => void;
    onAcceptPartyInvite?: (partyId: string) => void;
    onDeclinePartyInvite?: (partyId: string) => void;
    onEquipInventoryItem?: (tab: InventoryTab, index: number) => void;
    onUnequipInventoryItem?: (slot: EquipmentSlot) => void;
    onUseInventoryItem?: (tab: InventoryTab, index: number) => void;
    onTriggerHotbarAction?: (actionId: HotbarActionId) => void;
    onCloseNpcDialog?: () => void;
    onBuyShopItem?: (itemId: string) => void;
    onSellShopItem?: (tab: InventoryTab, index: number) => void;
    onAcceptQuest?: (questId: string) => void;
    onClaimQuest?: (questId: string) => void;
    onSendDuelChallenge?: (targetId: string, stake: DuelStakeSelectionData) => void;
    onAcceptDuelChallenge?: (challengerId: string, stake: DuelStakeSelectionData) => void;
    onDeclineDuelChallenge?: (challengerId: string) => void;
    onCancelDuelChallenge?: () => void;
    onSubmitChat?: (channel: Exclude<HudChatChannel, "system">, text: string) => void;
    onChatFocusChange?: (focused: boolean) => void;
}
