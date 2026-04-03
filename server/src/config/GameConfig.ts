/**
 * GameConfig — single source of truth for all balance constants.
 * Tweak here, never hardcode values in systems.
 */
export const GameConfig = {
    // --- Server Tick ---
    TICK_RATE_HZ: 60,           // Physics/movement update rate
    BROADCAST_RATE_HZ: 20,      // How often snapshot is sent to clients

    // --- Spawn ---
    SPAWN_X: 10,
    SPAWN_Y: 10,

    // --- Movement ---
    PLAYER_SPEED: 4.5,          // Tiles per second (consistent in all directions)

    // --- Combat ---
    PLAYER_MAX_HP: 100,
    PLAYER_ATTACK_DAMAGE: 15,
    PLAYER_ATTACK_RANGE: 2.5,   // Tiles (cartesian distance)
    PLAYER_ATTACK_COOLDOWN_MS: 1000,

    // --- Death & Respawn ---
    RESPAWN_DELAY_MS: 3000,
} as const;
