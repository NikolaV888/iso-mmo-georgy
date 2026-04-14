import { MapSchema } from "@colyseus/schema";
import {
    getNpcDefinition,
    getNpcDefinitionById,
    listNpcDefinitions,
    type NpcKind,
} from "../config/NpcCatalog";
import { Player } from "../rooms/schema/GameState";
import { TerrainSystem } from "./TerrainSystem";
import { type NpcQuestOfferPayload, QuestSystem } from "./QuestSystem";
import {
    type ShopBuyEntryPayload,
    type ShopSellEntryPayload,
    ShopSystem,
} from "./ShopSystem";

export interface NpcDialogStatePayload {
    isOpen: boolean;
    npcId: string | null;
    npcName: string;
    greeting: string;
    hint: string;
    quest: NpcQuestOfferPayload | null;
    shopItems: ShopBuyEntryPayload[];
    sellItems: ShopSellEntryPayload[];
}

const CLOSED_DIALOG_STATE: NpcDialogStatePayload = {
    isOpen: false,
    npcId: null,
    npcName: "",
    greeting: "",
    hint: "",
    quest: null,
    shopItems: [],
    sellItems: [],
};

export class NpcSystem {
    spawnNpcs(players: MapSchema<Player>): void {
        listNpcDefinitions().forEach((definition) => {
            const npc = new Player();
            npc.name = definition.name;
            npc.isMob = false;
            npc.mobKind = "";
            npc.isNpc = true;
            npc.npcKind = definition.kind;
            npc.level = 1;
            npc.exp = 0;
            npc.expToNextLevel = 0;
            npc.gold = 0;
            npc.bonusStatPoints = 0;
            npc.str = 0;
            npc.agi = 0;
            npc.int = 0;
            npc.vit = 0;
            npc.hp = 1;
            npc.maxHp = 1;
            npc.attackDamage = 0;
            npc.attackSpeed = 0;
            npc.attackRange = 0;
            npc.moveSpeed = 0;
            npc.isDead = false;
            npc.canFly = false;
            npc.isFlying = false;
            npc.isGrounded = true;
            npc.isKnockedDown = false;
            npc.combatTargetId = "";

            const x = TerrainSystem.clampCoordinate(definition.x);
            const y = TerrainSystem.clampCoordinate(definition.y);
            const groundZ = TerrainSystem.getGroundHeight(x, y);
            npc.x = x;
            npc.y = y;
            npc.targetX = x;
            npc.targetY = y;
            npc.spawnX = x;
            npc.spawnY = y;
            npc.groundZ = groundZ;
            npc.z = groundZ;

            players.set(definition.id, npc);
        });
    }

    openInteraction(
        player: Player,
        npcId: string,
        players: MapSchema<Player>
    ): { error?: string } {
        const npc = players.get(npcId);
        if (!npc || !npc.isNpc) {
            return { error: "That NPC is not available." };
        }

        if (!this.isNpcInRange(player, npc, npc.npcKind as NpcKind)) {
            return { error: "Move closer to talk to that NPC." };
        }

        player.activeNpcId = npcId;
        return {};
    }

    closeInteraction(player: Player): void {
        player.activeNpcId = "";
    }

    buildDialogState(
        player: Player,
        players: MapSchema<Player>,
        questSystem: QuestSystem,
        shopSystem: ShopSystem
    ): NpcDialogStatePayload {
        const npc = this.getActiveNpc(player, players);
        if (!npc) {
            player.activeNpcId = "";
            return CLOSED_DIALOG_STATE;
        }

        const npcKind = npc.npcKind as NpcKind;
        const definition = getNpcDefinitionById(player.activeNpcId);
        if (!definition) {
            player.activeNpcId = "";
            return CLOSED_DIALOG_STATE;
        }

        return {
            isOpen: true,
            npcId: definition.id,
            npcName: definition.name,
            greeting: definition.greeting,
            hint: definition.hint,
            quest: questSystem.getNpcQuestOffer(player, npcKind),
            shopItems: shopSystem.getBuyEntries(player, npcKind),
            sellItems: shopSystem.getSellEntries(player),
        };
    }

    ensureInteractionStillValid(player: Player, players: MapSchema<Player>): boolean {
        const npc = this.getActiveNpc(player, players);
        if (!npc) {
            player.activeNpcId = "";
            return false;
        }

        return true;
    }

    private getActiveNpc(player: Player, players: MapSchema<Player>): Player | null {
        if (!player.activeNpcId) return null;

        const npc = players.get(player.activeNpcId);
        if (!npc || !npc.isNpc) return null;

        if (!this.isNpcInRange(player, npc, npc.npcKind as NpcKind)) {
            return null;
        }

        return npc;
    }

    private isNpcInRange(player: Player, npc: Player, npcKind: NpcKind): boolean {
        const interactionRange = getNpcDefinition(npcKind).interactionRange;
        const dx = npc.x - player.x;
        const dy = npc.y - player.y;
        return Math.sqrt(dx * dx + dy * dy) <= interactionRange;
    }
}
