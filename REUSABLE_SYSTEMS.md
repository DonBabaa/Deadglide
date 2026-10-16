# DeadSlide: what is reusable in another game

This is a technical handover of the systems, patterns and lessons from DeadSlide that would carry over to a completely different game. Nothing here is about the story. Each section says what the system does, how it is built, which file to lift it from, and what to change.

The files are in `src/`. Sizes are given where a file is large enough that you would copy the idea rather than the file.

---

## 1. The stack and why it worked

| Piece | Choice | Notes |
|---|---|---|
| Rendering | Three.js (r0.186) | Plain scene graph, no engine on top |
| Build | Vite | `npm run dev`, `npm run build`. No config needed |
| Language | Plain JavaScript, ES modules | No TypeScript, no framework |
| UI | HTML and CSS over the canvas | Menus, HUD, overlays are all DOM |
| Tuning | lil-gui | One live panel bound to a `config` object |
| Multiplayer | PeerJS (WebRTC), host authoritative | No game server |
| Online scores | One Netlify Function + Netlify Blobs | No database |
| Saves | `localStorage` | One small wrapper |
| Art and audio | All generated in code | No asset files to load or license |
| Hosting | Netlify, auto-deploy from GitHub `main` | Push to publish |

**Why keep it:** zero loading screens, instant iteration, and nothing to install on a friend's machine. The whole game is one static page.

**Where it strains:** `main.js` grew to about 1,300 lines because it owns the run state and wires every system together. In a new game, split that earlier (see section 16).

---

## 2. One `config` object, tuned live

**File:** `src/config.js`, `src/ui/tweakPanel.js`

Every number that affects feel lives in one exported object, grouped by system (`config.skate`, `config.horde`, `config.descent`, ...), each with a one-line comment saying what it does and its unit.

- Systems read `config.x.y` every frame, never a cached copy, so a change takes effect at once.
- The tuning panel (backquote key) binds lil-gui sliders straight to that object.
- Comments are written for a designer, not a programmer: "seconds between throws", "how far behind you it can fall".

**Reuse as is.** This was the single most useful decision for balancing by feel.

---

## 3. The main loop

**File:** `src/main.js`

One `requestAnimationFrame` loop with four mutually exclusive modes, checked in this order:

1. **Menu:** update the menu scene, render, return.
2. **Dragging/minigame** (a full-screen interaction that replaces play).
3. **Cutscene active:** call only `cutscenes.update(dt)`.
4. **Playing:** fixed-step physics, then every system's `update(dt)`.

Details worth copying:

- **Fixed timestep for physics** (1/240 s) with an accumulator; everything else runs on the frame's `dt`.
- **`dt` is clamped** to 0..0.05 s. The lower bound matters: resetting the "last frame" clock mid-frame can otherwise produce a negative step.
- **A `paused` flag plus an overlay** covers pause, death, level complete and "choose an upgrade". The overlay's click handler decides what resume means from flags (`dead`, `won`, ...).
- **Systems report, the loop acts.** A system's `update()` returns a small object (`{ hit, caught, finished }`) or pushes onto an `events` array. `main.js` is the only place that plays sounds, shows popups and changes run state in response. Systems stay ignorant of each other.

---

## 4. Movement over a height function

**File:** `src/player/skater.js` (about 700 lines), `src/world/terrain.js`

The world's ground is a pure function `heightAt(x, z)`. The player is a point with velocity that:

- samples the height and its slope to get a ground normal,
- accelerates along the slope under gravity,
- leaves the ground when the surface falls away faster than it can follow, and lands when it meets it again.

That gives ramps, bowls, half pipes and kickers for free: anything you can write as a height is rideable, with no collision meshes.

**Reusable parts:**

- **Airborne/grounded state** with a "time since ground" value, used for coyote time and for landing detection.
- **Charge-and-release jump:** hold to charge, release to jump, strength interpolated between a min and max.
- **Rails as line segments:** each rail is two points with `next`/`prev` links. Catching is a distance test to the segment with a small magnet pull. While on a rail the player is a parameter `t` along it, and chains hand over to the next segment.
- **"Clear of rails until grounded"** after stepping off, so you do not instantly re-catch the rail you just left.
- **Invisible limits** applied in the system that owns the level (clamp position, reflect and damp the outward velocity) rather than building walls into the terrain.

**For a different game:** the height-function idea suits anything on terrain (driving, skiing, rolling, a platformer on slopes). It does not suit overhangs or interiors with multiple floors.

---

## 5. The chase camera

**File:** `src/player/chaseCamera.js`

A third-person camera that follows from behind with smoothing, widens its field of view with speed, and has a `snap(target)` method to cut instantly after a teleport or respawn. A per-level `confine(pos)` function keeps it inside walls.

**Reuse:** always provide `snap()`. Every teleport, level change and cutscene exit needs it.

---

## 6. Levels as data, worlds as fixed shapes or streamed chunks

**Files:** `src/world/level.js`, `worldgen.js`, `chunkMesh.js`, plus one file per level

### Level table

`LEVELS[n]` is a plain object of flags: `name`, `tagline`, `next`, `gravity`, and behaviour flags (`freeRide`, `finale`, `descent`). Code asks `LEVELS[level].descent`, never `level === 5`. Adding a level is adding a row and a few hooks.

### Two ways to make a world

1. **Procedural, streamed in chunks** (96 m squares, seeded). Used for the open first level. Chunks load around the player, one per frame, and unload behind.
2. **A fixed "arena" module.** Used for every later level. Each exports the same shape:

```js
export function xxxHeight(x, z, drawn)   // the ground
export const PROPS = [], RAILS = []       // what stands on it
export function fillXxx(chunk)            // hand a chunk its props and rails
export function xxxConfine(pos)           // keep the camera inside
```

The chunk system still draws it, so a hand-designed level and a procedural one share all rendering code. **This pattern is the most reusable piece of world code.** A new level is one file.

### Ground painted per vertex

The ground mesh is a 1 m grid with vertex colours over a neutral texture. A level can export `xxxTint(x, z)` returning a colour, which gives road markings, paths, hazard stripes and zones with no extra textures or meshes.

### Props from a small feature library

`src/world/features.js` builds kickers, boxes, funboxes, rails and so on from parameters (`width`, `radius`, `angle`, `facing` in degrees). They contribute to the height function, so they are rideable automatically.

---

## 7. Scenery that costs almost nothing

**File:** `src/world/descentScene.js` (the best example), `chunkMesh.js`

A three-kilometre level with a city, a cemetery, an industrial stretch and a forest is about forty draw calls. The technique:

- **`InstancedMesh` for everything repeated:** one unit box, one cylinder, one merged tree. A helper takes a list of `{ x, y, z, sx, sy, sz, rx, ry, rz, color }` and builds the instances.
- **`frustumCulled = false`** on instanced meshes that span the whole level.
- **Per-instance colour** for variety from one material.
- **Buildings with lit windows:** a canvas texture for the wall and a second canvas for the emissive map, with a material array so roofs do not get windows.
- **Distant lights as `Points`** with a soft sprite and additive blending: hundreds of lamps in one draw call, no real lights.
- **A skyline cylinder** that follows the player (open cylinder, inside faces, canvas texture, no fog), so the horizon never gets closer.
- **Welding:** `mergeGeometries` to collapse a model or a chunk's props into one mesh per material. Watch for one trap: `toNonIndexed()` returns the same object when the geometry is already non-indexed, so cloning must be explicit before transforming shared geometry.

**Rule that fell out of it:** scenery is non-solid and lives in its own module; anything the player can touch lives in the level's height function. Keeping those apart made both easy to change.

---

## 8. All textures drawn in code

**Files:** `src/world/textures.js`, `src/player/kirkyTextures.js`

Every texture is a `<canvas>` drawn at start-up: noise blotches, grain, cracks, panels, window grids, decals, signs with text. A small `canvas(size, draw)` helper returns a `CanvasTexture` with the right colour space.

**Reuse:** this removes the entire asset pipeline. Signs and labels are just `fillText`, so in-world text is trivial.

---

## 9. Characters built from parts

**Files:** `src/player/skaterModel.js`, `src/enemies/enemyModels.js`

- **The player** is a hierarchy of simple shapes (boxes, capsules, spheres) with named joints. Poses are set by rotating joints directly; there is no skeleton or animation file.
- **Enemies** are a list of parts, each `{ geometry, pivot, swing, phase, glow }`. One generic routine animates every enemy type by swinging each part about its pivot. A new enemy is a new function returning a parts list.
- **Enemies are drawn instanced**, one `InstancedMesh` per part per type, so a horde of hundreds is a handful of draw calls.
- **Cosmetics** repaint materials and toggle the visibility of alternative pieces sharing one attachment point. `applyLook(look)` takes one plain object.

**Reuse:** the parts-list approach scales well for stylised games and makes "the same model as a ghost" or "the same model, bigger, as a boss" a one-liner.

---

## 10. Enemies, waves and bosses

**Files:** `src/enemies/horde.js` (about 1,000 lines), `types.js`

- **Types are data:** speed, health, damage, radius, score, plus optional behaviour blocks (`webs`, `shed`, `bones`). Behaviour code checks for the block.
- **A wave director** spawns by time and wave number from config, with elite variants and a mini-boss and boss at set waves.
- **A pooled projectile system** (fixed-size array, instanced meshes, several visual kinds) shared by every ranged enemy.
- **Bosses are enemies with a `boss` flag** and one extra update routine. Health thresholds push events (`bossHalf`, `bossDead`).
- **Telegraphed attacks:** every boss attack is "signal, wait, strike", with the wait time in config. A ground marker shows where it will land.

**Reuse:** the event queue and the telegraph pattern. For a different genre, the spawn director and pooled projectiles still apply.

---

## 11. Progression inside a run

**Files:** `src/systems/xp.js`, `upgrades.js`, `loot.js`, `player/powerups.js`, `player/stats.js`

- **A `stats` object** rebuilt at the start of a run from base values, then modified by permanent purchases, then by in-run upgrades. Systems read stats, never raw config, for anything upgradable.
- **Upgrades are data:** `{ id, name, max, apply(stats, level) }`. The level-up screen draws three at random.
- **XP gems** that fly to the player within a pickup radius.
- **Chests and timed power-ups** with their own small state machines.
- **Carry-over between levels:** `restart(carry)` keeps weapons, upgrades and score when moving to the next level, and resets them on death.

---

## 12. Progression between runs

**Files:** `src/systems/profile.js`, `cosmetics.js`, `storage.js`, `src/menu/shop.js`

- **One profile object** saved as JSON in `localStorage`. Loading is defensive: every field is validated and clamped, unknown fields are ignored, and a missing or corrupt save falls back to a fresh profile.
- **Everything purchasable is a table:** permanent upgrades with price ladders, one-off unlocks, items to unlock, cosmetics by slot.
- **Three kinds of "not for sale" cosmetics**, each a flag on the option: won in a minigame, found as a secret, awarded for finishing. The shop shows each differently.
- **`cleared` levels** decide what the level select offers.
- **Currency is only banked on success**, which makes extraction a real decision.

**Lesson:** adding a new saved field is safe only because loading validates each field separately. Adding a new field also gave a clean way to reset everyone's progress without touching their currency.

---

## 13. Cutscenes

**File:** `src/cutscenes.js` (about 1,500 lines)

This is the largest reusable system. A cutscene is a function of time:

```js
begin(duration, step(t, dt), done)
```

`step` places the camera and moves the few things allowed to move. While one plays, the main loop calls nothing else.

**Building blocks:**

| Helper | Purpose |
|---|---|
| `view(fov, shake)` | Put the camera at the shared `eye`, looking at `target`, with shake |
| `once(name, t, at, fn)` | Fire something a single time when the clock passes a moment |
| `blink(t, at)` | Fade to black around a hard cut |
| `goHome()` | Restore the gameplay camera exactly |
| `props()` | Lazily built scene props, hidden whenever nothing is playing |
| `story(shots, done)` | A list of `{ for, line, cam(k, t), at() }` shots with captions |
| `say(at, hold, text)` | Add one caption to a scene that has none |

**Features added along the way that you will want from day one:**

- **Holds:** a scene declares the times at which it waits for the player (`scene.holds`). The clock freezes there until `next()`.
- **Auto-advance** for lines shown during combat, so a fight is never held up indefinitely.
- **Skip** per scene, plus a global "story off" switch, plus a `keep` flag for scenes that must always play.
- **`cleanup`** so a scene that brings its own actors always puts them away, including when cancelled.
- **`seek(t)`** that also restores holds and re-arms one-off events when going backwards.
- **Chaining:** a scene's `done` can start the next scene, including across a level change.

**The house style** (worth keeping for consistency): several hard cuts on white flashes, a snap zoom at the start of a shot, speed lines, slow motion on the key beat, a large title card.

**Pitfalls found:**

- Never assume the ground is flat. Clamp the camera and any thrown object above `heightAt` at their own position.
- A character's "front" may not be the model's forward axis. Derive facing from the head, not from the root.
- A scene that plays right after a level change needs the sky, lighting and nearby ground positioned before its first frame.

---

## 14. A cinematics editor

**File:** end of `src/main.js`

Behind a URL switch (`?editor`), the menu lists every scene. Each entry is:

```js
{ name, where, run(), replace() }
```

`run()` sets the game up the way the scene needs (level, a boss, a body) and either plays the scene or does whatever makes the game play it naturally. `replace()` handles scenes that need another scene's setup first.

A bar across the top gives a time readout, a scrub slider, pause, restart, speed, wait-on-lines toggle, next line, previous and next scene.

**Reuse:** build this at the same time as the cutscene system, not after. It found a dozen bugs in an afternoon that months of normal play would have hidden. The same idea works for any content that is slow to reach by playing: boss phases, endings, rare events.

---

## 15. HUD and overlays as DOM

**Files:** `src/ui/hud.js`, `index.html`, `src/style.css`

The HUD is one object of small methods, each doing one DOM update: `popup(text, kind)`, `flash(colour, amount)`, `lines(amount)`, `caption(text, hint)`, `bossIntro(name, label)`, `place(name, label)`, markers for off-screen objectives.

- **Body classes switch whole layouts:** `body.cutscene` hides the HUD and slides in letterbox bars; a per-level class hides irrelevant panels. No JavaScript layout logic.
- **CSS transitions do the easing** for flashes and bars.
- **Captions only rewrite the DOM when the text changes.**
- **Screens taller than the window** need `overflow-y: auto` and `justify-content: safe center`, or the title scrolls out of reach.

---

## 16. Input

**Files:** `src/input.js`, `src/ui/keys.js`

- **Physical key codes** (`KeyW`), never characters, so the game works on AZERTY and QWERTY alike.
- **On-screen key hints are translated** to the player's layout from `data-key` attributes, so help text shows the right letter.
- **Pointer lock** for mouse look, with loss of lock treated as pause. Any mode that needs the cursor (editor, menus) must skip locking.

---

## 17. Audio with no files

**Files:** `src/fx/audio.js`, `src/fx/music.js`

Every sound is synthesised with the Web Audio API from three primitives:

```js
tone(type, fromHz, toHz, seconds, volume, delay)
hiss(filterType, fromHz, toHz, seconds, volume, delay)
blast(fromHz, toHz, seconds, volume, delay)
```

A sound effect is three to eight of these layered. Music is a small step sequencer with named styles switched by `setMusicStyle(name)`.

- Audio is **unlocked on the first click** (browser rule); every play function returns early until then.
- Separate volume and mute for music and effects, saved.

**Reuse:** the three primitives cover impacts, weapons, UI, ambience and stings. Budget real listening time; nothing here can be verified from screenshots.

---

## 18. Multiplayer without a server

**Files:** `src/freeride/ride.js`, `src/casino/net.js`

- PeerJS gives WebRTC data channels with a short room code. One player hosts and is authoritative.
- Each client sends a small state packet several times a second (position, velocity, a few enums); others are drawn as interpolated "ghosts".
- Shared interactions (a card table, a hit) are messages the host validates and rebroadcasts.
- Emotes and cosmetics travel as small integers or ids.

**Limits:** fine for a handful of friends in a co-operative or social space. It is not cheat-resistant and not suited to competitive play.

---

## 19. Online leaderboards on a free tier

**Files:** `netlify/functions/leaderboard.mjs`, `src/ui/leaderboard.js`

One serverless function with GET and POST, storing a sorted list per board in Netlify Blobs. Boards are keys in a map, so adding one is a line.

- **Any metric becomes a score** by mapping it so that bigger is better (a time becomes `1,000,000 minus centiseconds`).
- Names are cleaned on both client and server.
- It only works on the published site, so local testing shows a clear message instead of failing silently.

---

## 20. Scoring and combos

**Files:** `src/systems/score.js`, `lines.js`

- **Multiplier with a decay window:** actions extend a streak timer; when it lapses the multiplier drops.
- **Lines:** a chain of tricks scored together and banked on landing cleanly, lost on a fall.
- **Best scores stored locally**, with separate boards per mode.

---

## 21. Minigames inside the game

**Files:** `src/casino/*`

A separate room with its own camera and loop, entered from the menu. It contains several small games sharing one currency and one net layer. The pattern that mattered: **the room is a self-contained mode** with `enter()`, `exit()` and its own update, so the main game does not know its rules.

---

## 22. Secrets and conditions

**File:** `src/freeride/eggs.js`

A tidy pattern for hidden goals: one module holds a handful of condition checks (stand still here, circle that, do X from there), each calling `won(id)` once. It takes `has(id)` and `onFound(id)` callbacks, so it knows nothing about rewards or saving.

---

## 23. Performance notes

- **F3 readout** of frame time and draw calls from the start.
- **Draw calls are the budget.** Instancing and welding took chunk builds from about 36 ms to 14 ms.
- **One real light per scene where possible.** Everything else is emissive materials and additive sprites.
- **Build one chunk per frame** while streaming, all at once only when priming before a cut.
- **Pools, not allocation,** for projectiles, particles and smoke.
- **Shared temp vectors** at module scope instead of `new Vector3()` in loops. Be careful that two helpers do not both use the same temp.

---

## 24. How the work was organised

These are process lessons rather than code.

- **A living spec** (`GAME_SPEC.md`) updated with every change, written in plain language. It was the reference for what the game is supposed to do.
- **A `window.game` debug handle** exposing the main systems. With it, any state can be set from the console: teleport, kill a boss, jump a cutscene to a time.
- **URL switches for testing:** a fixed seed, unlock everything, open the editor.
- **Screenshots and scripted runs verify layout and logic but not feel, motion or sound.** Every report separated "seen" from "not tested". Plan a real playthrough before each release.
- **A bot run is a cheap balance check.** A script holding one key down a level showed exactly where and why a passive player dies.
- **Small, reversible changes with a build after each.** The build took under a second, so there was no reason to batch.

---

## 25. What I would do differently in a new game

1. **Split the run state out of `main.js`** into a `run` module (health, death, level changes, carry-over) and keep `main.js` as wiring only.
2. **Build the cutscene editor with the first cutscene.**
3. **Give every level file the same exports from the start** (height, tint, props, confine, spawn), including the procedural one.
4. **Put a `facing()` helper and a `headPosition()` helper on the character model** on day one.
5. **Decide early whether story lines wait for input,** and build holds in from the beginning.
6. **Keep scenery and solid geometry in separate modules** from the first level.
7. **Add a second input scheme (gamepad or touch) while the input layer is small.**
8. **Record sounds for review,** since they cannot be checked any other way.

---

## 26. Quick lift list

If you are starting a new project and want the highest-value pieces first:

| Take | From | Effort to adapt |
|---|---|---|
| `config` + live tuning panel | `config.js`, `ui/tweakPanel.js` | Minutes |
| Storage wrapper and validated profile | `systems/storage.js`, `profile.js` | Minutes |
| Canvas texture helpers | `world/textures.js` | Minutes |
| Synth audio primitives | `fx/audio.js` | Minutes |
| HUD object and body-class layouts | `ui/hud.js`, `style.css` | An hour |
| Instanced scenery helper | `world/descentScene.js` | An hour |
| Cutscene framework and editor | `cutscenes.js`, end of `main.js` | Half a day |
| Level table and arena-module pattern | `world/level.js`, `world/house.js` | Half a day |
| Parts-list characters and instanced hordes | `enemies/*` | A day |
| Leaderboard function | `netlify/functions/leaderboard.mjs` | An hour |
| PeerJS rooms and ghosts | `freeride/ride.js` | A day |
