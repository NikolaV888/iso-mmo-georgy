/**
 * GameConfig - single source of truth for all balance constants.
 * Tweak here, never hardcode values in systems.
 */
export const GameConfig = {
    // --- Server Tick ---
    TICK_RATE_HZ: 60,
    BROADCAST_RATE_HZ: 20,

    // --- World ---
    WORLD_SIZE: 20,
    WORLD_MIN: 0,
    WORLD_MAX: 20,

    // --- Spawn ---
    SPAWN_X: 10,
    SPAWN_Y: 10,

    // --- Movement / Iso Physics ---
    PLAYER_SPEED: 4.5,
    PLAYER_JUMP_SPEED: 5.6,
    PLAYER_JUMP_COOLDOWN_MS: 650,
    AUTO_JUMP_MIN_ASCENT: 0.35,
    AUTO_JUMP_MAX_ASCENT: 1.3,
    AUTO_JUMP_SCAN_DISTANCE: 2.5,
    AUTO_JUMP_TARGET_DISTANCE: 5.0,
    GRAVITY: -18,
    FLYING_HOVER_HEIGHT: 1.6,

    // --- Combat ---
    PLAYER_MAX_HP: 100,
    PLAYER_ATTACK_DAMAGE: 15,
    PLAYER_ATTACK_RANGE: 2.5,
    PLAYER_ATTACK_SPEED: 1.0,
    COMBO_RESET_MS: 1500,
    COMBO_KNOCKUP_SPEED: 5.2,
    COMBO_SLAM_SPEED: -10.0,
    KNOCKDOWN_DURATION_MS: 900,
    AIR_COMBO_BONUS_DAMAGE: 4,

    // --- RPG Stats Base ---
    PLAYER_BASE_LEVEL: 1,
    PLAYER_BASE_EXP: 0,
    PLAYER_BASE_GOLD: 0,
    PLAYER_BASE_STR: 5,
    PLAYER_BASE_AGI: 5,
    PLAYER_BASE_INT: 5,
    PLAYER_BASE_VIT: 5,
    LEVEL_UP_STAT_POINTS: 3,
    EXP_LEVEL_BASE: 35,
    EXP_LEVEL_GROWTH: 15,

    // --- Party ---
    PARTY_MAX_SIZE: 4,
    PARTY_SHARE_RANGE: 8.0,

    // --- Death & Respawn ---
    RESPAWN_DELAY_MS: 3000,

    // --- Mobs ---
    MOB_RESPAWN_DELAY_MS: 6000,
    MOB_AGGRO_RANGE: 6.5,
    MOB_LEASH_RANGE: 8.5,
    MOB_WANDER_RADIUS: 3.0,
    MOB_WANDER_INTERVAL_MS: 1800,

    SLIME_MAX_HP: 50,
    SLIME_DAMAGE: 8,
    SLIME_SPEED: 2.8,
    SLIME_ATTACK_RANGE: 1.7,
    SLIME_ATTACK_SPEED: 0.9,
    SLIME_EXP_REWARD: 18,
    SLIME_GOLD_REWARD: 7,
    SLIME_HOP_INTERVAL_MS: 1400,
    SLIME_JUMP_SPEED: 4.8,

    BAT_MAX_HP: 38,
    BAT_DAMAGE: 10,
    BAT_SPEED: 3.6,
    BAT_ATTACK_RANGE: 2.2,
    BAT_ATTACK_SPEED: 1.2,
    BAT_EXP_REWARD: 24,
    BAT_GOLD_REWARD: 11,

    // --- Chat ---
    CHAT_RANGE: 8,
    CHAT_MAX_LENGTH: 100,
    CHAT_BUBBLE_DURATION_MS: 5000,
} as const;
