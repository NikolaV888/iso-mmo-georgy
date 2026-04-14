import {
    buildInventoryStatePayload,
    createEmptyEquipmentLoadout,
    createEmptyInventoryCollection,
    getItemDefinition,
    getMobLootDrop,
    isEquipmentSlot,
    isInventoryTab,
    listStarterItems,
    type EquipmentSlot,
    type InventoryCollection,
    type InventoryStatePayload,
    type InventoryTab,
} from "../config/ItemCatalog";
import { Player } from "../rooms/schema/GameState";
import { StatsSystem } from "./StatsSystem";

export interface InventoryResult {
    error?: string;
    info?: string;
}

export interface RemovedInventoryStack {
    itemId: string;
    count: number;
    tab: InventoryTab;
}

export class InventorySystem {
    constructor(private readonly statsSystem: StatsSystem) {}

    initializePlayerInventory(player: Player): void {
        player.inventory = createEmptyInventoryCollection();
        player.equipment = createEmptyEquipmentLoadout();

        listStarterItems().forEach(({ itemId, count }) => {
            this.addItem(player.inventory, itemId, count);
        });
    }

    getInventoryState(player: Player): InventoryStatePayload {
        return buildInventoryStatePayload(player.inventory, player.equipment);
    }

    equipItem(player: Player, tab: unknown, index: unknown): InventoryResult {
        if (!isInventoryTab(tab)) return { error: "Invalid inventory tab." };
        if (tab !== "equip") return { error: "Only equipment items can be equipped." };

        const itemIndex = this.toArrayIndex(index);
        if (itemIndex === null) return { error: "Invalid inventory slot." };

        const stack = player.inventory[tab][itemIndex];
        if (!stack) return { error: "No item found in that slot." };

        const item = getItemDefinition(stack.itemId);
        if (!item || item.kind !== "equipment" || !item.equipSlot) {
            return { error: "That item cannot be equipped." };
        }

        player.inventory[tab].splice(itemIndex, 1);

        const previousItemId = player.equipment[item.equipSlot];
        player.equipment[item.equipSlot] = item.id;

        if (previousItemId) {
            this.addItem(player.inventory, previousItemId, 1);
        }

        this.statsSystem.recalculatePlayerDerivedStats(player, { preserveHpRatio: true });
        return { info: `${item.name} equipped.` };
    }

    unequipItem(player: Player, slot: unknown): InventoryResult {
        if (!isEquipmentSlot(slot)) return { error: "Invalid equipment slot." };

        const itemId = player.equipment[slot];
        if (!itemId) return { error: "Nothing is equipped in that slot." };

        delete player.equipment[slot];
        this.addItem(player.inventory, itemId, 1);
        this.statsSystem.recalculatePlayerDerivedStats(player, { preserveHpRatio: true });

        const item = getItemDefinition(itemId);
        return { info: `${item?.name ?? "Item"} unequipped.` };
    }

    useItem(player: Player, tab: unknown, index: unknown): InventoryResult {
        if (!isInventoryTab(tab)) return { error: "Invalid inventory tab." };

        const itemIndex = this.toArrayIndex(index);
        if (itemIndex === null) return { error: "Invalid inventory slot." };

        const stack = player.inventory[tab][itemIndex];
        if (!stack) return { error: "No item found in that slot." };

        const item = getItemDefinition(stack.itemId);
        if (!item || item.kind !== "consumable" || !item.useEffect) {
            return { error: "That item cannot be used." };
        }

        const healAmount = item.useEffect.healAmount ?? 0;
        if (healAmount <= 0) {
            return { error: "That item has no usable effect yet." };
        }

        if (player.hp >= player.maxHp) {
            return { error: "HP is already full." };
        }

        player.hp = Math.min(player.maxHp, player.hp + healAmount);
        this.consumeStack(player.inventory, tab, itemIndex);

        return { info: `${item.name} used. Restored ${healAmount} HP.` };
    }

    grantMobLoot(player: Player, mobKind: string): InventoryResult | null {
        const drop = getMobLootDrop(mobKind);
        if (!drop) return null;

        this.addItem(player.inventory, drop.itemId, drop.count);
        const item = getItemDefinition(drop.itemId);
        return { info: `Looted ${item?.name ?? drop.itemId}.` };
    }

    grantItem(player: Player, itemId: string, count: number): InventoryResult {
        const item = getItemDefinition(itemId);
        if (!item) {
            return { error: "That item does not exist." };
        }

        this.addItem(player.inventory, itemId, count);
        return {
            info: count > 1 ? `Received ${count}x ${item.name}.` : `Received ${item.name}.`,
        };
    }

    removeInventoryStack(
        player: Player,
        tab: unknown,
        index: unknown
    ): { stack?: RemovedInventoryStack; error?: string } {
        if (!isInventoryTab(tab)) return { error: "Invalid inventory tab." };

        const itemIndex = this.toArrayIndex(index);
        if (itemIndex === null) return { error: "Invalid inventory slot." };

        const stack = player.inventory[tab][itemIndex];
        if (!stack) return { error: "No item found in that slot." };

        player.inventory[tab].splice(itemIndex, 1);
        return {
            stack: {
                itemId: stack.itemId,
                count: stack.count,
                tab,
            },
        };
    }

    private addItem(inventory: InventoryCollection, itemId: string, count: number): void {
        if (count <= 0) return;

        const item = getItemDefinition(itemId);
        if (!item) return;

        if (item.kind === "equipment") {
            for (let index = 0; index < count; index += 1) {
                inventory[item.tab].push({ itemId, count: 1 });
            }
            return;
        }

        const existing = inventory[item.tab].find((entry) => entry.itemId === itemId);
        if (existing) {
            existing.count += count;
            return;
        }

        inventory[item.tab].push({ itemId, count });
    }

    private consumeStack(inventory: InventoryCollection, tab: InventoryTab, index: number): void {
        const stack = inventory[tab][index];
        if (!stack) return;

        stack.count -= 1;
        if (stack.count <= 0) {
            inventory[tab].splice(index, 1);
        }
    }

    private toArrayIndex(value: unknown): number | null {
        return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
    }
}
