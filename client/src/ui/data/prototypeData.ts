import type {
    EquipmentLoadout,
    HotbarEntryData,
    HudPlayerData,
    InventoryItem,
    InventoryStateData,
    InventoryTab,
    PvpStateData,
    PartyStateData,
    QuestEntryData,
    QuestStateData,
    SkillEntryData,
    SkillStateData,
    NpcDialogStateData,
} from "../types";

export const DEFAULT_HUD_PLAYER: HudPlayerData = {
    name: "Player",
    level: 1,
    exp: 0,
    expToNextLevel: 35,
    gold: 0,
    bonusStatPoints: 0,
    hp: 100,
    maxHp: 100,
    str: 5,
    agi: 5,
    int: 5,
    vit: 5,
    attackDamage: 0,
    attackSpeed: 0,
    moveSpeed: 0,
    pvpEnabled: false,
    pvpTagged: false,
};

export const DEFAULT_PARTY_STATE: PartyStateData = {
    partyId: null,
    leaderId: null,
    members: [],
    invites: [],
};

const DEFAULT_INVENTORY: Record<InventoryTab, InventoryItem[]> = {
    equip: [
        {
            id: "bronze-sword",
            name: "Bronze Sword",
            count: 1,
            description: "A starter blade with a dependable swing.",
            kind: "equipment",
            equipSlot: "weapon",
            rarity: "common",
            statLine: "+2 attack feel",
        },
        {
            id: "traveler-hat",
            name: "Traveler Hat",
            count: 1,
            description: "Light headgear for new adventurers.",
            kind: "equipment",
            equipSlot: "head",
            rarity: "common",
            statLine: "+1 field awareness",
        },
        {
            id: "leather-vest",
            name: "Leather Vest",
            count: 1,
            description: "Keeps the first few hits from stinging too much.",
            kind: "equipment",
            equipSlot: "chest",
            rarity: "common",
            statLine: "+4 comfort armor",
        },
        {
            id: "wander-boots",
            name: "Wander Boots",
            count: 1,
            description: "Broken-in footwear for crossing tile seams and ramps.",
            kind: "equipment",
            equipSlot: "feet",
            rarity: "uncommon",
            statLine: "+2 move feel",
        },
        {
            id: "bronze-band",
            name: "Bronze Band",
            count: 1,
            description: "A cheap ring that still feels heroic when the sun catches it.",
            kind: "equipment",
            equipSlot: "accessory",
            rarity: "common",
            statLine: "+1 morale",
        },
    ],
    use: [
        {
            id: "red-potion",
            name: "Red Potion",
            count: 10,
            description: "Restores a little HP while the combat loop is still intentionally simple.",
            kind: "consumable",
            rarity: "common",
            hotbarEligible: true,
        },
        {
            id: "jump-tonic",
            name: "Jump Tonic",
            count: 3,
            description: "A draft for terrain practice and future air-combo routes.",
            kind: "consumable",
            rarity: "uncommon",
            hotbarEligible: true,
        },
    ],
    etc: [
        {
            id: "slime-gel",
            name: "Slime Gel",
            count: 7,
            description: "Soft residue collected from slimes.",
            kind: "material",
            rarity: "common",
        },
        {
            id: "bat-wing",
            name: "Bat Wing",
            count: 2,
            description: "A fluttery trophy from cave pests.",
            kind: "material",
            rarity: "uncommon",
        },
    ],
    cash: [],
};

export function cloneInventoryCollection(): Record<InventoryTab, InventoryItem[]> {
    return {
        equip: DEFAULT_INVENTORY.equip.map((item) => ({ ...item })),
        use: DEFAULT_INVENTORY.use.map((item) => ({ ...item })),
        etc: DEFAULT_INVENTORY.etc.map((item) => ({ ...item })),
        cash: DEFAULT_INVENTORY.cash.map((item) => ({ ...item })),
    };
}

export function createInitialEquipmentLoadout(): EquipmentLoadout {
    return {};
}

export function createEmptyInventoryState(): InventoryStateData {
    return {
        tabs: {
            equip: [],
            use: [],
            etc: [],
            cash: [],
        },
        equipment: createInitialEquipmentLoadout(),
    };
}

export function buildPrototypeSkillEntries(
    player: HudPlayerData
): SkillEntryData[] {
    return [
        {
            id: "power-strike",
            name: "Power Strike",
            category: "Combat",
            hotkey: "1",
            description: "Drive a heavier single-target strike into your current target.",
            status: "Online",
            unlocked: true,
            ready: true,
            cooldownRemainingMs: 0,
            targeting: "target",
        },
        {
            id: "rising-uppercut",
            name: "Rising Uppercut",
            category: "Combat",
            hotkey: "2",
            description: "Launch a grounded target upward to start an air route.",
            status: "Ready",
            unlocked: true,
            ready: true,
            cooldownRemainingMs: 0,
            targeting: "target",
        },
        {
            id: "guardian-pulse",
            name: "Guardian Pulse",
            category: "Recovery",
            hotkey: "3",
            description: "Restore HP to yourself with a short recovery pulse.",
            status: player.level >= 2 ? "Ready" : "Lv. 2",
            unlocked: player.level >= 2,
            ready: player.level >= 2,
            cooldownRemainingMs: 0,
            targeting: "self",
        },
    ];
}

export function createEmptySkillState(): SkillStateData {
    return {
        skills: buildPrototypeSkillEntries(DEFAULT_HUD_PLAYER),
    };
}

export function createEmptyQuestState(): QuestStateData {
    return {
        entries: [],
    };
}

export function createClosedNpcDialogState(): NpcDialogStateData {
    return {
        isOpen: false,
        npcId: null,
        npcName: "",
        greeting: "",
        hint: "",
        quest: null,
        shopItems: [],
        sellItems: [],
    };
}

export function createEmptyPvpState(): PvpStateData {
    return {
        pvpEnabled: false,
        pvpTagged: false,
        incomingChallenge: null,
        outgoingChallenge: null,
        activeDuel: null,
    };
}

export function buildHotbarEntries(
    skillState: SkillStateData,
    inventoryState: InventoryStateData
): HotbarEntryData[] {
    const redPotionStack = inventoryState.tabs.use.find((item) => item.id === "red-potion");
    const redPotionCount = redPotionStack?.count ?? 0;

    return [
        ...skillState.skills.map((skill) => ({
            id: skill.id,
            label: skill.name,
            shortLabel: skill.name,
            hotkey: skill.hotkey,
            description: skill.description,
            status: skill.status,
            category: "combat" as const,
            ready: skill.ready,
        })),
        {
            id: "use-potion",
            label: "Red Potion",
            shortLabel: "Potion",
            hotkey: "4",
            description: "Drink a healing potion from your real inventory state.",
            status: redPotionCount > 0 ? `${redPotionCount} left` : "Empty",
            category: "combat",
            ready: redPotionCount > 0,
        },
        {
            id: "clear-target",
            label: "Clear Target",
            shortLabel: "Clear",
            hotkey: "5",
            description: "Drop your current target lock and reset the frame.",
            status: "Ready",
            category: "utility",
            ready: true,
        },
        {
            id: "pack-panel",
            label: "Field Pack",
            shortLabel: "Pack",
            hotkey: "6",
            description: "Open the inventory and equipment layout.",
            status: "Open",
            category: "utility",
            ready: true,
        },
    ];
}

export function buildPrototypeQuestEntries(
    player: HudPlayerData,
    partyState: PartyStateData,
    onlinePlayerCount: number
): QuestEntryData[] {
    const totalInvestedPoints =
        player.str + player.agi + player.int + player.vit - 20;
    const highestCoreStat = Math.max(player.str, player.agi, player.int, player.vit);

    return [
        {
            id: "first-loop",
            title: "First Loop",
            phase: "active",
            status: `Lv. ${player.level}`,
            summary: "Hit the first MMO beats so the prototype feels like a living world instead of a tech demo.",
            objectives: [
                { label: "Reach level 2", complete: player.level >= 2 },
                { label: "Carry 25 gold", complete: player.gold >= 25 },
                {
                    label: "Join or create a party",
                    complete: partyState.partyId !== null,
                },
            ],
            rewardText: "Signals the core session loop is landing.",
        },
        {
            id: "build-identity",
            title: "Build Identity",
            phase: "available",
            status: player.bonusStatPoints > 0 ? "Points ready" : "Stable",
            summary: "Use the live stat hooks to move from placeholder hero toward a reusable class shell.",
            objectives: [
                {
                    label: "Spend your first bonus stat point",
                    complete: totalInvestedPoints > 0,
                },
                {
                    label: "Push one core stat to 7+",
                    complete: highestCoreStat >= 7,
                },
                {
                    label: "Share the field with another player",
                    complete: onlinePlayerCount > 0,
                },
            ],
            rewardText: "Opens the door for cleaner class and skill systems next.",
        },
    ];
}
