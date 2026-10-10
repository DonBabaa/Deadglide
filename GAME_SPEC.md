# DEADGLIDE — Game Spec for Claude Code

> Read this whole file before writing code. Build **one milestone at a time**. After each milestone, stop, tell me how to run it, and wait for my feedback before continuing.

## Pitch
A 3D browser arcade roguelike. You glide through a graveyard skatepark on a momentum-based board, carving, jumping and pulling tricks while you gun down waves of skeletons and zombies. **Style powers your firepower**: the better you skate, the harder you hit. Stop moving and you die.

Runs last ~10–15 minutes. Fun to play, fun to tweak.

## Tech stack
- **Three.js** for rendering, **Vite** as dev server/bundler, plain **JavaScript (ES modules)**. No TypeScript, no frameworks.
- **Physics:** a custom kinematic skating controller (raycasts against the ground for surface normal + gravity + friction). Use `@dimforge/rapier3d-compat` only if collisions get painful; don't start with it.
- **Zero external art/audio assets.** Everything procedural: low-poly geometry built in code, emissive materials, WebAudio-synthesized sound effects.
- Runs with `npm install && npm run dev`, then open in browser. Must hold 60 fps on a mid-range laptop with 150+ enemies on screen (use `InstancedMesh` for mobs and bullets).

## Look & feel
- **Neon graveyard at night**: dark low-poly terrain, tombstones, crypts, half-pipes and bowls; glowing cyan/magenta accents, fog, bloom (`UnrealBloomPass`).
- Skeletons glow bone-white, zombies sickly green. Enemies burst into particles on death.
- **Juice is a priority**, not polish-for-later: screen shake, hit-stop on kills (2–3 frames), FOV kick at high speed, speed lines, trail behind the board, satisfying synthesized hit/kill sounds.

## Controls (keyboard + mouse, pointer lock)
| Input | Action |
|---|---|
| W / S | Push (accelerate) / brake |
| A / D | Carve left / right (turn rate drops at high speed) |
| Space (hold → release) | Charge & ollie; higher charge = bigger jump |
| Shift | Drift: hard carve, sheds a little speed, builds style |
| Mouse | Aim (camera follows board heading, mouse offsets aim) |
| Left click (hold) | Fire primary weapon |
| Q / E / R / F (in air) | Tricks: spin, flip, grab, tweak |
| Esc | Pause |

## Core systems

### 1. Skating (Milestone 1 — the most important thing in the game)
- **Momentum-first.** Speed is conserved; gravity accelerates you down slopes and slows you going up. Low ground friction, small air drag. Pushing adds speed up to a soft cap; slopes can exceed it.
- Board aligns to the ground normal (smoothly slerped). Ramps and bowls launch you based on velocity along the surface.
- **Landing:** if board heading vs velocity is within ~30° and you're upright → clean landing (keep speed, small boost). Otherwise → **bail**: lose most speed, brief stun, style combo breaks.
- Camera: third-person chase, slightly above and behind, lags behind on turns, pulls back and widens FOV with speed.
- Expose all tuning constants in one `config.js` (gravity, friction, push force, max speed, turn rate, jump force, etc.) with a **live tweak panel** (`lil-gui`, toggled with `` ` ``). Tuning the feel is half the fun.

### 2. Tricks & Style
- Air tricks (Q/E/R/F) each take time to complete; landing mid-trick = bail. Spins scale with rotation (180/360/540...).
- Ground style: drifting, near-misses with enemies (passing within 1.5m), sustained high speed, kills while airborne.
- **Style meter (combo):** trick points accumulate into a combo multiplier (x1 → x8). Combo decays if you're slow or grounded too long; resets on bail or taking damage.
- On-screen trick text pops ("KICKFLIP 360 +450 x3") in arcade style.

### 3. Shooting
- Primary weapon auto-fires on hold toward the aim point. Light aim assist (bullets bend slightly toward nearest enemy in a cone).
- **Combo multiplier scales damage and fire rate.** Speed adds bonus damage on top (at 100% max speed: +50%).
- Projectiles are pooled `InstancedMesh`.

### 4. Enemies
Simple, readable steering AI (seek player, separation between mobs). Start with:
- **Shambler (zombie):** slow, tanky, comes in crowds.
- **Rattler (skeleton):** fast, fragile, flanks.
- **Bonethrower (skeleton):** keeps distance, lobs slow arcing projectiles.
- **Bloater (zombie):** explodes on death; the blast also damages other mobs.
- Contact damages the player. Enemies spawn from graves/crypts around the arena edges.

### 5. Run structure
- One arena per run. **Endless escalating waves**; every 5th wave is a **boss** (first boss: a giant skeleton that slams the ground, creating shockwaves you must jump over).
- Between waves: pick **1 of 3 random upgrades** (pause screen with cards).
- Run ends on death → results screen (waves survived, best combo, total score) → restart.
- Health: start with 5 hearts. Small chance of health pickups from kills.

### 6. Upgrades (initial pool, ~15; easy to add more via a data file)
Mix of gun, skate and synergy upgrades. Examples:
- **Split Shot:** +2 projectiles at an angle.
- **Grindstone:** bullets pierce 1 extra enemy.
- **Air Superiority:** +100% damage while airborne.
- **Deck Spikes:** ramming enemies at >70% speed deals damage.
- **Shockwave Landing:** clean landings release a damage ring scaled by air time.
- **Momentum Bank:** combo decays 50% slower.
- **Ghost Wheels:** first bail per wave is forgiven.
- **Trick Ammo:** each completed trick fires a homing volley.
- **Bone Magnet:** larger pickup radius.
Store upgrades in `upgrades.js` as data objects with `id`, `name`, `description`, `rarity`, `apply(player)`, stackable or not.

### 7. UI / HUD
Minimal arcade HUD: hearts, speed bar, combo multiplier (big, pulsing), current trick text, wave counter, score. Title screen with "PRESS ENTER". All UI in HTML/CSS overlay, not in WebGL.

## Code structure (suggested)
```
src/
  main.js          // bootstrap, game loop (fixed timestep physics, variable render)
  config.js        // all tuning constants
  input.js
  player/skater.js // movement controller
  player/tricks.js
  player/weapon.js
  enemies/         // one file per enemy type + spawner.js
  world/arena.js   // procedural graveyard skatepark
  systems/         // combo.js, waves.js, upgrades.js, pickups.js
  fx/              // particles.js, juice.js (shake, hitstop), audio.js
  ui/hud.js, ui/screens.js
```
Keep files small and readable; I want to tweak things myself.

## Milestones
1. **Skate sandbox.** Arena with ramps, a bowl and slopes. Fully working momentum skating, ollie, landings/bails, chase camera, tweak panel. No enemies. *This must feel great before moving on.*
2. **Tricks & style.** Air tricks, style meter, trick text, ground style sources.
3. **Guns & mobs.** Weapon, Shambler + Rattler, spawner, damage, health, death/restart.
4. **The loop.** Waves, upgrade picks between waves, remaining enemy types, first boss, score/results screen.
5. **Juice pass.** Bloom, particles, hit-stop, screen shake, synthesized audio, speed FX, title screen.
6. **Content.** More upgrades, enemies, a second boss; balance pass.

## Rules for you (Claude Code)
- Stop after each milestone and summarize what to test.
- Prefer simple, readable code over clever abstractions.
- When something feel-related is ambiguous, pick a default, expose it in `config.js`, and tell me.
- Don't add assets, libraries or features not in this spec without asking.
