export type InventoryTab = "equip" | "use" | "etc" | "cash";
export type EquipmentSlot =
    | "weapon"
    | "head"
    | "chest"
    | "hands"
    | "feet"
    | "accessory";
export type InventoryItemKind = "equipment" | "consumable" | "material" | "cash";
export type ItemRarity = "common" | "uncommon" | "rare";
export type MobKind = "slime" | "bat";

export interface InventoryStack {
    itemId: string;
    count: number;
}

export type InventoryCollection = Record<InventoryTab, InventoryStack[]>;
export type EquipmentLoadout = Partial<Record<EquipmentSlot, string>>;

export interface ItemBonuses {
    str: number;
    agi: number;
    int: number;
    vit: number;
    attackDamage: number;
    attackSpeed: number;
    moveSpeed: number;
    maxHp: number;
}

export interface ItemUseEffect {
    healAmount?: number;
}

export interface ItemDefinition {
    id: string;
    name: string;
    tab: InventoryTab;
    kind: InventoryItemKind;
    description: string;
    rarity: ItemRarity;
    buyPrice?: number;
    sellPrice?: number;
    equipSlot?: EquipmentSlot;
    bonuses?: Partial<ItemBonuses>;
    useEffect?: ItemUseEffect;
    statLine?: string;
    hotbarEligible?: boolean;
}

export interface InventoryItemView {
    id: string;
    name: string;
    count: number;
    description: string;
    kind: InventoryItemKind;
    rarity: ItemRarity;
    equipSlot?: EquipmentSlot;
    statLine?: string;
    hotbarEligible?: boolean;
}

export interface InventoryStatePayload {
    tabs: Record<InventoryTab, InventoryItemView[]>;
    equipment: Partial<Record<EquipmentSlot, InventoryItemView>>;
}

const EMPTY_BONUSES: ItemBonuses = {
    str: 0,
    agi: 0,
    int: 0,
    vit: 0,
    attackDamage: 0,
    attackSpeed: 0,
    moveSpeed: 0,
    maxHp: 0,
};

const ITEM_CATALOG: Record<string, ItemDefinition> = {
    "bronze-sword": {
        id: "bronze-sword",
        name: "Bronze Sword",
        tab: "equip",
        kind: "equipment",
        description: "A starter blade with a dependable swing.",
        rarity: "common",
        buyPrice: 24,
        sellPrice: 12,
        equipSlot: "weapon",
        bonuses: { attackDamage: 3 },
        statLine: "+3 attack damage",
    },
    "traveler-hat": {
        id: "traveler-hat",
        name: "Traveler Hat",
        tab: "equip",
        kind: "equipment",
        description: "Light headgear for new adventurers.",
        rarity: "common",
        buyPrice: 20,
        sellPrice: 10,
        equipSlot: "head",
        bonuses: { vit: 1 },
        statLine: "+1 VIT",
    },
    "leather-vest": {
        id: "leather-vest",
        name: "Leather Vest",
        tab: "equip",
        kind: "equipment",
        description: "Keeps the first few hits from stinging too much.",
        rarity: "common",
        buyPrice: 30,
        sellPrice: 15,
        equipSlot: "chest",
        bonuses: { maxHp: 12 },
        statLine: "+12 max HP",
    },
    "wander-boots": {
        id: "wander-boots",
        name: "Wander Boots",
        tab: "equip",
        kind: "equipment",
        description: "Broken-in footwear for crossing tile seams and ramps.",
        rarity: "uncommon",
        buyPrice: 28,
        sellPrice: 14,
        equipSlot: "feet",
        bonuses: { moveSpeed: 0.3 },
        statLine: "+0.30 move speed",
    },
    "bronze-band": {
        id: "bronze-band",
        name: "Bronze Band",
        tab: "equip",
        kind: "equipment",
        description: "A cheap ring that still feels heroic when the sun catches it.",
        rarity: "common",
        buyPrice: 26,
        sellPrice: 13,
        equipSlot: "accessory",
        bonuses: { str: 1 },
        statLine: "+1 STR",
    },
    "red-potion": {
        id: "red-potion",
        name: "Red Potion",
        tab: "use",
        kind: "consumable",
        description: "Restores a chunk of HP.",
        rarity: "common",
        buyPrice: 9,
        sellPrice: 4,
        useEffect: { healAmount: 35 },
        statLine: "Recover 35 HP",
        hotbarEligible: true,
    },
    "jump-tonic": {
        id: "jump-tonic",
        name: "Jump Tonic",
        tab: "use",
        kind: "consumable",
        description: "A springy tonic for combat drills.",
        rarity: "uncommon",
        buyPrice: 12,
        sellPrice: 6,
        useEffect: { healAmount: 18 },
        statLine: "Recover 18 HP",
        hotbarEligible: true,
    },
    "slime-gel": {
        id: "slime-gel",
        name: "Slime Gel",
        tab: "etc",
        kind: "material",
        description: "Soft residue collected from slimes.",
        rarity: "common",
        sellPrice: 3,
    },
    "bat-wing": {
        id: "bat-wing",
        name: "Bat Wing",
        tab: "etc",
        kind: "material",
        description: "A fluttery trophy from cave pests.",
        rarity: "uncommon",
        sellPrice: 5,
    },
};

const STARTER_ITEMS: InventoryStack[] = [
    { itemId: "bronze-sword", count: 1 },
    { itemId: "traveler-hat", count: 1 },
    { itemId: "leather-vest", count: 1 },
    { itemId: "wander-boots", count: 1 },
    { itemId: "bronze-band", count: 1 },
    { itemId: "red-potion", count: 5 },
    { itemId: "jump-tonic", count: 2 },
];

const MOB_LOOT_TABLE: Record<MobKind, InventoryStack> = {
    slime: { itemId: "slime-gel", count: 1 },
    bat: { itemId: "bat-wing", count: 1 },
};

export function createEmptyInventoryCollection(): InventoryCollection {
    return {
        equip: [],
        use: [],
        etc: [],
        cash: [],
    };
}

export function createEmptyEquipmentLoadout(): EquipmentLoadout {
    return {};
}

export function listStarterItems(): InventoryStack[] {
    return STARTER_ITEMS.map((item) => ({ ...item }));
}

export function getMobLootDrop(mobKind: string): InventoryStack | null {
    const drop = MOB_LOOT_TABLE[mobKind as MobKind];
    if (!drop) return null;
    return { ...drop };
}

export function isInventoryTab(value: unknown): value is InventoryTab {
    return value === "equip" || value === "use" || value === "etc" || value === "cash";
}

export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
    return (
        value === "weapon" ||
        value === "head" ||
        value === "chest" ||
        value === "hands" ||
        value === "feet" ||
        value === "accessory"
    );
}

export function getItemDefinition(itemId: string): ItemDefinition | null {
    return ITEM_CATALOG[itemId] ?? null;
}

export function getEquipmentBonuses(equipment: EquipmentLoadout): ItemBonuses {
    const totals = { ...EMPTY_BONUSES };

    Object.values(equipment).forEach((itemId) => {
        if (!itemId) return;
        const item = getItemDefinition(itemId);
        if (!item?.bonuses) return;

        totals.str += item.bonuses.str ?? 0;
        totals.agi += item.bonuses.agi ?? 0;
        totals.int += item.bonuses.int ?? 0;
        totals.vit += item.bonuses.vit ?? 0;
        totals.attackDamage += item.bonuses.attackDamage ?? 0;
        totals.attackSpeed += item.bonuses.attackSpeed ?? 0;
        totals.moveSpeed += item.bonuses.moveSpeed ?? 0;
        totals.maxHp += item.bonuses.maxHp ?? 0;
    });

    return totals;
}

export function buildInventoryStatePayload(
    inventory: InventoryCollection,
    equipment: EquipmentLoadout
): InventoryStatePayload {
    return {
        tabs: {
            equip: inventory.equip.map(toInventoryItemView),
            use: inventory.use.map(toInventoryItemView),
            etc: inventory.etc.map(toInventoryItemView),
            cash: inventory.cash.map(toInventoryItemView),
        },
        equipment: {
            weapon: toEquippedItemView(equipment.weapon),
            head: toEquippedItemView(equipment.head),
            chest: toEquippedItemView(equipment.chest),
            hands: toEquippedItemView(equipment.hands),
            feet: toEquippedItemView(equipment.feet),
            accessory: toEquippedItemView(equipment.accessory),
        },
    };
}

function toInventoryItemView(stack: InventoryStack): InventoryItemView {
    const item = getItemDefinition(stack.itemId);
    if (!item) {
        return {
            id: stack.itemId,
            name: stack.itemId,
            count: stack.count,
            description: "Unknown item.",
            kind: "material",
            rarity: "common",
        };
    }

    return {
        id: item.id,
        name: item.name,
        count: stack.count,
        description: item.description,
        kind: item.kind,
        rarity: item.rarity,
        equipSlot: item.equipSlot,
        statLine: item.statLine,
        hotbarEligible: item.hotbarEligible,
    };
}

function toEquippedItemView(itemId?: string): InventoryItemView | undefined {
    if (!itemId) return undefined;
    return toInventoryItemView({ itemId, count: 1 });
}
