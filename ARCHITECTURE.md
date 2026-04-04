# Isometric MMO — Architecture Reference

## Stack
| Layer | Tech | Role |
|---|---|---|
| Client | Phaser 3 + TypeScript (Vite) | Rendering, input, visual feedback |
| Transport | WebSocket (Colyseus 0.15) | Bidirectional real-time comms |
| Game Server | Colyseus + Node.js | Authoritative game loop |
| Database | Supabase / Postgres | Persistence (auth, saves) — coming soon |
| Hosting | Railway (server) + Vercel (client) | |

---

## 📋 Up Next
- [ ] Basic NPC enemies (server-side, auto-aggro)
- [ ] Supabase integration — player accounts + auth
- [ ] Persistent character saves (position, hp, stats)
- [ ] Player name labels above heads
- [ ] Tile-based map definition (JSON map file)

---

## Core Design Principles

### Server Authoritative
The server owns all game state. Clients **never** modify state directly.

```
Client sends INTENT →  Server validates → Server mutates state → Server broadcasts snapshot
```

- Client sends: `move {x, y}`, `attack {targetId}`
- Server sends: `snapshot`, `combatEvent`, `playerDied`, `playerRespawned`, `init`

### Message Protocol

| Message | Direction | Payload | Purpose |
|---|---|---|---|
| `init` | S→C | `{ sessionId }` | Tell client their own ID on join |
| `move` | C→S | `{ x, y }` | Request movement to cartesian position |
| `attack` | C→S | `{ targetId }` | Request attack on target player |
| `snapshot` | S→C | `Record<sessionId, PlayerSnapshot>` | Full world state at 20Hz |
| `combatEvent` | S→C | `{ attacker, target, damage, targetHp }` | Hit feedback for UI |
| `playerDied` | S→C | `{ sessionId }` | Trigger death animation/state |
| `playerRespawned` | S→C | `{ sessionId, x, y }` | Trigger respawn |

---

## Server Architecture

```
server/src/
├── index.ts                  # HTTP + WS server bootstrap
├── config/
│   └── GameConfig.ts         # All tunable constants (speeds, damage, ranges)
├── rooms/
│   ├── GameRoom.ts           # Colyseus Room — wires systems together, handles messages
│   └── schema/
│       └── GameState.ts      # Colyseus Schema — Player data structure
└── systems/
    ├── MovementSystem.ts     # Moves players toward targets each tick
    └── CombatSystem.ts       # Attack validation, damage, death, respawn
```

### 🔥 Current Sprint
- [x] Modular systems architecture (MovementSystem, CombatSystem)
- [x] Health & damage
- [x] Click-to-auto-attack (Server-authoritative)
- [x] Death & respawn
- [x] HTML/DOM based HUD overlay (Stats Window, Bottom Action Bar)
- [x] RPG Core Stats schema (Level, Exp, Str, Agi, Int, Vit)
- [ ] Implement stat assignment (+ buttons on level up)

### Systems Pattern
Each `System` has an `update(state, deltaTime)` method. `GameRoom` calls them in order each tick. Adding a new system (e.g. `ZoneSystem`, `SpawnSystem`) = create a new file, import it in `GameRoom`, call it in the loop.

### GameConfig.ts
**All balance numbers live here.** Never hardcode values in systems. This makes balancing and future mod support trivial.

---

## Client Architecture

```
client/src/
├── main.ts                   # Phaser Game bootstrap
├── scenes/
│   └── GameScene.ts          # Main scene: rendering, input, network events
└── ui/
    └── HudOverlay.ts         # Pure DOM manager for persistent UI (Stats, Bottom Bar)
```

### Rendering & UI Model
- **World:** Drawn by Phaser onto the `<canvas>`.
- **Coordinates:** Cartesian internally, converted to screen via `cartToIso(x, y)`.
- **UI System:** Classic MMO windows (Stats) and floating elements (Chat input) are implemented as standard **HTML/CSS `div`s** absolutely positioned over the canvas with `z-index: 1000`. This is much easier to maintain than Phaser text containers. `GameScene` passes snapshot data to `HudManager` to keep the DOM in sync.

### Click Resolution
1. Player containers are interactive (`setInteractive`)  
2. Click on a container → `attack` message (stops propagation)
3. Click on the ground → `move` message

---

## Planned Systems (Backlog)
See `BACKLOG.md` for priorities.

- `ZoneSystem` — danger zones, safe zones, respawn zones
- `SpawnSystem` — enemy NPC spawning
- `LootSystem` — item drops on death
- `ChatSystem` — in-world chat
- `AuthSystem` — Supabase login, character persistence
