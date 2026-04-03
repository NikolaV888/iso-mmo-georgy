import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
    // Position
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") targetX: number = 0;
    @type("number") targetY: number = 0;

    // Combat stats
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("boolean") isDead: boolean = false;

    // Server-only fields (not synced via schema, managed internally)
    lastAttackTime: number = 0;
    respawnAt: number = 0;      // timestamp when to respawn (0 = not pending)
}

export class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
}
