# Backlog

Legend: `[x]` done · `[/]` in progress · `[ ]` todo · `[~]` icebox

---

## ✅ Done
- [x] Colyseus server + Phaser client scaffolded
- [x] Isometric grid rendering (cartesian → iso projection)
- [x] Server-authoritative click-to-move
- [x] Multiplayer position sync via snapshot broadcast
- [x] Placeholder character (head/body/shadow container)
- [x] GitHub repo + Railway/Vercel deploy config
- [x] Architecture docs + Backlog

---

## 🔥 Current Sprint
- [x] Modular systems architecture (MovementSystem, CombatSystem)
- [x] Health & damage
- [x] Click-to-auto-attack
- [x] Death & respawn
- [x] Stats Window & HTML UI overlay
- [x] Chat system (proximity speech bubbles)
- [ ] Basic NPC enemies (server-side, auto-aggro)
- [ ] Supabase integration — player accounts + auth

---

## 📋 Up Next
- [ ] Persistent character saves (position, hp, stats)
- [ ] Player name labels above heads
- [ ] Tile-based map definition (JSON map file)

---

## 🗺️ Future / Icebox
- [ ] ZoneSystem — danger zones, safe zones
- [ ] SpawnSystem — enemy wave spawning
- [ ] LootSystem — item drops
- [ ] InventorySystem — items, equipment
- [ ] SkillSystem — abilities with cooldowns
- [ ] PathfindingSystem — A* for click-to-move pathfinding around obstacles
- [ ] CameraSystem — smooth follow camera centered on local player
- [ ] ParticleSystem — hit effects, footsteps
- [ ] SoundSystem — positional audio
- [ ] AdminSystem — GM tools (kick, teleport, spawn)
- [ ] Match/Zone instancing — separate Colyseus rooms per map zone
