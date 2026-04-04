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
    PLAYER_MAX_HP:             100,
    PLAYER_ATTACK_DAMAGE:       15,
    PLAYER_ATTACK_RANGE:       2.5,   // Tiles (cartesian distance)
    PLAYER_ATTACK_SPEED:       1.0,   // Attacks per second (base). Higher = faster.
                                       // Future: modified by AGI, weapon type, buffs.
                                       // Cooldown (ms) = 1000 / attackSpeed

    // --- Death & Respawn ---
    RESPAWN_DELAY_MS: 3000,

    // --- Chat ---
    CHAT_RANGE: 8,              // Tiles — only players within this receive the message
    CHAT_MAX_LENGTH: 100,       // Characters
    CHAT_BUBBLE_DURATION_MS: 5000, // How long the bubble stays visible
} as const;
