import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * Player doubles as the shared combat entity model for both real players and mobs.
 * The room keeps everything in one map so targeting, combat, and movement can work
 * across PvP and PvE with the same systems.
 */
export class Player extends Schema {
    @type("string") name: string = "Player";
    @type("boolean") isMob: boolean = false;
    @type("string") mobKind: string = "";

    // --- Position / Iso Physics ---
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") targetX: number = 0;
    @type("number") targetY: number = 0;
    @type("number") z: number = 0;
    @type("number") groundZ: number = 0;
    @type("boolean") isGrounded: boolean = true;
    @type("boolean") canFly: boolean = false;
    @type("boolean") isFlying: boolean = false;
    @type("boolean") isKnockedDown: boolean = false;

    // --- Combat Target ---
    @type("string") combatTargetId: string = "";

    // --- Stats / Progression ---
    @type("number") level: number = 1;
    @type("number") exp: number = 0;
    @type("number") expToNextLevel: number = 0;
    @type("number") bonusStatPoints: number = 0;
    @type("number") str: number = 5;
    @type("number") agi: number = 5;
    @type("number") int: number = 5;
    @type("number") vit: number = 5;

    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") attackDamage: number = 15;
    @type("number") attackSpeed: number = 1.0;
    @type("number") attackRange: number = 2.5;
    @type("number") moveSpeed: number = 4.5;
    @type("number") expReward: number = 0;

    // --- Status ---
    @type("boolean") isDead: boolean = false;

    // --- Server-only state ---
    lastAttackTime: number = 0;
    respawnAt: number = 0;
    vz: number = 0;
    spawnX: number = 0;
    spawnY: number = 0;
    lastJumpTime: number = 0;
    knockdownUntil: number = 0;
    pendingKnockdown: boolean = false;
    comboStage: number = 0;
    comboTargetId: string = "";
    lastComboAt: number = 0;
    nextAiThinkAt: number = 0;
    lastAiActionAt: number = 0;
    aiSeed: number = Math.random() * Math.PI * 2;
    hoverPhaseOffset: number = Math.random() * 1000;
}

export class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}
