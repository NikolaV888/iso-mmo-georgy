import { getItemDefinition, isInventoryTab, type InventoryTab } from "../config/ItemCatalog";
import { getNpcDefinition, type NpcKind } from "../config/NpcCatalog";
import { Player } from "../rooms/schema/GameState";
import { type InventoryResult, InventorySystem } from "./InventorySystem";

export interface ShopBuyEntryPayload {
    itemId: string;
    name: string;
    description: string;
    price: number;
    canAfford: boolean;
}

export interface ShopSellEntryPayload {
    tab: InventoryTab;
    index: number;
    itemId: string;
    name: string;
    count: number;
    priceEach: number;
    totalPrice: number;
}

export class ShopSystem {
    getBuyEntries(player: Player, npcKind: NpcKind): ShopBuyEntryPayload[] {
        const npc = getNpcDefinition(npcKind);

        return npc.shopInventory
            .map((itemId) => {
                const item = getItemDefinition(itemId);
                const price = item?.buyPrice ?? 0;
                if (!item || price <= 0) return null;

                return {
                    itemId,
                    name: item.name,
                    description: item.description,
                    price,
                    canAfford: player.gold >= price,
                };
            })
            .filter((entry): entry is ShopBuyEntryPayload => entry !== null);
    }

    getSellEntries(player: Player): ShopSellEntryPayload[] {
        const entries: ShopSellEntryPayload[] = [];

        (["equip", "use", "etc"] as const).forEach((tab) => {
            player.inventory[tab].forEach((stack, index) => {
                const item = getItemDefinition(stack.itemId);
                const priceEach = item?.sellPrice ?? 0;
                if (!item || priceEach <= 0) return;

                entries.push({
                    tab,
                    index,
                    itemId: item.id,
                    name: item.name,
                    count: stack.count,
                    priceEach,
                    totalPrice: priceEach * stack.count,
                });
            });
        });

        return entries;
    }

    buyItem(
        player: Player,
        npcKind: NpcKind,
        itemId: string,
        inventorySystem: InventorySystem
    ): InventoryResult {
        const npc = getNpcDefinition(npcKind);
        if (!npc.shopInventory.includes(itemId)) {
            return { error: "That item is not sold here." };
        }

        const item = getItemDefinition(itemId);
        const price = item?.buyPrice ?? 0;
        if (!item || price <= 0) {
            return { error: "That item is not available for purchase." };
        }

        if (player.gold < price) {
            return { error: "You do not have enough gold." };
        }

        player.gold -= price;
        inventorySystem.grantItem(player, itemId, 1);
        return { info: `Purchased ${item.name} for ${price} gold.` };
    }

    sellItem(
        player: Player,
        tab: unknown,
        index: unknown,
        inventorySystem: InventorySystem
    ): InventoryResult {
        if (!isInventoryTab(tab) || tab === "cash") {
            return { error: "That item cannot be sold." };
        }

        const stack = player.inventory[tab][typeof index === "number" ? index : -1];
        if (!stack) {
            return { error: "No item found in that slot." };
        }

        const item = getItemDefinition(stack.itemId);
        const priceEach = item?.sellPrice ?? 0;
        if (!item || priceEach <= 0) {
            return { error: "That item has no sell value." };
        }

        const removed = inventorySystem.removeInventoryStack(player, tab, index);
        if (removed.error || !removed.stack) {
            return { error: removed.error ?? "Could not remove that item." };
        }

        const totalPrice = priceEach * removed.stack.count;
        player.gold += totalPrice;
        return {
            info: `Sold ${removed.stack.count}x ${item.name} for ${totalPrice} gold.`,
        };
    }
}
