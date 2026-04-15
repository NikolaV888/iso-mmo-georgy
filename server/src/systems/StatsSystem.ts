import { GameConfig } from "../config/GameConfig";
import { getEquipmentBonuses } from "../config/ItemCatalog";
import { Player } from "../rooms/schema/GameState";
import { TerrainSystem } from "./TerrainSystem";

export type AllocatableStat = "str" | "agi" | "int" | "vit";

export interface ExpGainResult {
    amount: number;
    totalExp: number;
    level: number;
    expToNextLevel: number;
    bonusStatPoints: number;
    leveledUp: boolean;
}

export interface GoldGainResult {
    amount: number;
    totalGold: number;
}

export class StatsSystem {
    initializePlayer(player: Player, name: string): void {
        player.name = name;
        player.isMob = false;
        player.mobKind = "";
        player.isNpc = false;
        player.npcKind = "";
        player.canFly = false;
        player.isFlying = false;
        player.expReward = 0;
        player.goldReward = 0;
        player.bonusStatPoints = 0;

        player.level = GameConfig.PLAYER_BASE_LEVEL;
        player.exp = GameConfig.PLAYER_BASE_EXP;
        player.gold = GameConfig.PLAYER_BASE_GOLD;
        player.str = GameConfig.PLAYER_BASE_STR;
        player.agi = GameConfig.PLAYER_BASE_AGI;
        player.int = GameConfig.PLAYER_BASE_INT;
        player.vit = GameConfig.PLAYER_BASE_VIT;
        player.attackRange = GameConfig.PLAYER_ATTACK_RANGE;

        this.recalculatePlayerDerivedStats(player, { refillHp: true });
        this.resetPosition(player, GameConfig.SPAWN_X, GameConfig.SPAWN_Y);
    }

    initializeMob(player: Player, kind: "slime" | "bat", x: number, y: number): void {
        player.isMob = true;
        player.mobKind = kind;
        player.isNpc = false;
        player.npcKind = "";
        player.bonusStatPoints = 0;
        player.exp = 0;
        player.expToNextLevel = 0;
        player.gold = 0;
        player.level = 1;

        if (kind === "slime") {
            player.name = "Slime";
            player.canFly = false;
            player.isFlying = false;
            player.str = 4;
            player.agi = 3;
            player.int = 1;
            player.vit = 4;
            player.maxHp = GameConfig.SLIME_MAX_HP;
            player.hp = GameConfig.SLIME_MAX_HP;
            player.attackDamage = GameConfig.SLIME_DAMAGE;
            player.attackSpeed = GameConfig.SLIME_ATTACK_SPEED;
            player.attackRange = GameConfig.SLIME_ATTACK_RANGE;
            player.moveSpeed = GameConfig.SLIME_SPEED;
            player.expReward = GameConfig.SLIME_EXP_REWARD;
            player.goldReward = GameConfig.SLIME_GOLD_REWARD;
        } else {
            player.name = "Bat";
            player.canFly = true;
            player.isFlying = true;
            player.str = 4;
            player.agi = 7;
            player.int = 2;
            player.vit = 3;
            player.maxHp = GameConfig.BAT_MAX_HP;
            player.hp = GameConfig.BAT_MAX_HP;
            player.attackDamage = GameConfig.BAT_DAMAGE;
            player.attackSpeed = GameConfig.BAT_ATTACK_SPEED;
            player.attackRange = GameConfig.BAT_ATTACK_RANGE;
            player.moveSpeed = GameConfig.BAT_SPEED;
            player.expReward = GameConfig.BAT_EXP_REWARD;
            player.goldReward = GameConfig.BAT_GOLD_REWARD;
        }

        this.resetPosition(player, x, y);
    }

    recalculatePlayerDerivedStats(
        player: Player,
        options: { preserveHpRatio?: boolean; refillHp?: boolean } = {}
    ): void {
        const oldMaxHp = Math.max(1, player.maxHp || 1);
        const oldHp = player.hp;
        const bonuses = getEquipmentBonuses(player.equipment);
        const effectiveStr = player.str + bonuses.str;
        const effectiveAgi = player.agi + bonuses.agi;
        const effectiveVit = player.vit + bonuses.vit;

        player.maxHp = 50 + player.level * 10 + effectiveVit * 8 + bonuses.maxHp;
        player.attackDamage = 5 + player.level * 2 + effectiveStr * 2 + bonuses.attackDamage;
        player.attackSpeed = Math.min(2.5, 0.8 + effectiveAgi * 0.05 + bonuses.attackSpeed);
        player.attackRange = GameConfig.PLAYER_ATTACK_RANGE;
        player.moveSpeed = GameConfig.PLAYER_SPEED + effectiveAgi * 0.08 + bonuses.moveSpeed;
        player.expToNextLevel = this.getExpToNextLevel(player.level);

        if (options.refillHp) {
            player.hp = player.maxHp;
            return;
        }

        if (options.preserveHpRatio) {
            const ratio = oldHp / oldMaxHp;
            player.hp = Math.max(1, Math.round(player.maxHp * ratio));
            return;
        }

        player.hp = Math.min(player.maxHp, oldHp);
    }

    grantExp(player: Player, amount: number): ExpGainResult {
        if (player.isMob || amount <= 0) {
            return {
                amount: 0,
                totalExp: player.exp,
                level: player.level,
                expToNextLevel: player.expToNextLevel,
                bonusStatPoints: player.bonusStatPoints,
                leveledUp: false,
            };
        }

        player.exp += amount;
        let leveledUp = false;

        while (player.exp >= player.expToNextLevel) {
            player.exp -= player.expToNextLevel;
            player.level += 1;
            player.bonusStatPoints += GameConfig.LEVEL_UP_STAT_POINTS;
            this.recalculatePlayerDerivedStats(player, { refillHp: true });
            leveledUp = true;
        }

        player.expToNextLevel = this.getExpToNextLevel(player.level);

        return {
            amount,
            totalExp: player.exp,
            level: player.level,
            expToNextLevel: player.expToNextLevel,
            bonusStatPoints: player.bonusStatPoints,
            leveledUp,
        };
    }

    allocateStat(player: Player, stat: AllocatableStat): boolean {
        if (player.isMob || player.bonusStatPoints <= 0) return false;

        switch (stat) {
            case "str":
                player.str += 1;
                break;
            case "agi":
                player.agi += 1;
                break;
            case "int":
                player.int += 1;
                break;
            case "vit":
                player.vit += 1;
                break;
        }

        player.bonusStatPoints -= 1;
        this.recalculatePlayerDerivedStats(player, { preserveHpRatio: true });
        return true;
    }

    grantGold(player: Player, amount: number): GoldGainResult {
        if (player.isMob || amount <= 0) {
            return {
                amount: 0,
                totalGold: player.gold,
            };
        }

        player.gold += amount;
        return {
            amount,
            totalGold: player.gold,
        };
    }

    spendGold(player: Player, amount: number): GoldGainResult {
        if (player.isMob || amount <= 0) {
            return {
                amount: 0,
                totalGold: player.gold,
            };
        }

        const spent = Math.min(player.gold, Math.max(0, Math.floor(amount)));
        player.gold -= spent;
        return {
            amount: spent,
            totalGold: player.gold,
        };
    }

    resetPosition(player: Player, x: number, y: number): void {
        const clampedX = TerrainSystem.clampCoordinate(x);
        const clampedY = TerrainSystem.clampCoordinate(y);
        player.spawnX = clampedX;
        player.spawnY = clampedY;
        player.x = clampedX;
        player.y = clampedY;
        player.targetX = clampedX;
        player.targetY = clampedY;
        player.groundZ = TerrainSystem.getGroundHeight(clampedX, clampedY);
        player.z = player.canFly
            ? player.groundZ + GameConfig.FLYING_HOVER_HEIGHT
            : player.groundZ;
        player.vz = 0;
        player.isGrounded = !player.canFly;
        player.isFlying = player.canFly;
        player.isKnockedDown = false;
        player.knockdownUntil = 0;
        player.pendingKnockdown = false;
    }

    private getExpToNextLevel(level: number): number {
        return GameConfig.EXP_LEVEL_BASE + (level - 1) * GameConfig.EXP_LEVEL_GROWTH;
    }
}
