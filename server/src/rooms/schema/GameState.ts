import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * Player — all persistent in-game state for a connected player.
 *
 * Stats that affect gameplay (attackSpeed, attackDamage, attackRange, moveSpeed)
 * live here so the server can read them directly. In the future, derived stats
 * (from equipment, buffs, level) will be computed via a StatsSystem and written
 * onto these fields before the combat/movement systems read them.
 */
export class Player extends Schema {
    // ── Position ─────────────────────────────────────────────────────────
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") targetX: number = 0;
    @type("number") targetY: number = 0;

    // ── Auto-attack target ────────────────────────────────────────────────
    /** sessionId of the locked auto-attack target. Empty string = no target. */
    @type("string") combatTargetId: string = "";

    // ── Stats (base values — will be modified by equipment/buffs later) ──
    @type("number") hp: number           = 100;
    @type("number") maxHp: number        = 100;
    @type("number") attackDamage: number = 15;
    @type("number") attackSpeed: number  = 1.0;   // attacks per second
    @type("number") attackRange: number  = 2.5;   // tiles

    // ── Status ────────────────────────────────────────────────────────────
    @type("boolean") isDead: boolean = false;

    // ── Server-only (not broadcast via schema) ────────────────────────────
    /** Timestamp of the last auto-attack hit fired */
    lastAttackTime: number  = 0;
    /** When to respawn (0 = not pending) */
    respawnAt: number       = 0;
}

export class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}
