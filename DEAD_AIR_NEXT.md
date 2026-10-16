# DEAD AIR — THE BUILD LIST (his word, 2026-10-16 04:20: build until 20:00; anything needing his approval is skipped)

## Goals of the level
1. A player coming off the skate game understands within a minute that this is on foot, in the dark, against the dead, and why.
2. Terrifying between the safe rooms, relief inside them; funny where it is funny (the show, the boof, the chicken).
3. Replayable: every run has one mechanic that makes it a different night, and the nine logs take several runs to find.
4. Co-op is the point: things that need two (or four) people, and everyone visible in every cut-in.
5. It runs: no errors, 60 fps, a two-browser party works end to end.

## Priorities, in order (each ends with a headless check and stills)
A. The way in: the Moon freight lift (everyone aboard, the gate, the descent cut-in; signs and runway lights make it findable).
B. The landing, the lamps clicking on one by one, the safe first room (no spawns until the first scream), the first log, the hint strip.
C. The logs: nine one-line recordings (Jun), 3 placed per run from those not yet found, found ones persist; the card counts them;
   all nine: the crew's names and Benny's exchange on the ending, and the rubber chicken in the crate pool.
D. Tonight's modifier: one real mechanic per run (blackout night, low gravity, the quiet, twins, steam, the hunt); on the pick card
   and the loading screen; the host's choice reaches the guests.
E. Scares with cut-ins: crawlspace, sleepers' round, the Warden's hand, the knock, the hanging one, the ankle, steam bursts, blood
   trails, the stalker (eyes on it); the director rotates them by place.
F. Level content: Observation Deck (the dish), Crew Quarters (bunks, lockers, the safe, the chicken), Kask's blood writing.
G. The laughs: the boof dud, the conga, the Mastre trophy, the rubber chicken weapon.
H. Co-op: hold it shut, decompression, carry the downed, the uplink needs two, strap in, keep eyes on it, the dead-man safe,
   revive together, back to back, the core needs two hands (4 players).
I. Friends' Kirkys in the lounge and the open mic; the map scales with the party — and (his word, 04:50) the station gets
   a second deck with stairs (the kit's Platform_Stairs_4), bigger rooms and a higher ceiling.
I2. 19:30: a housekeeping and optimisation run (scheduled): errors, build, soak, frame time, dead code, docs, memory.
J. The song's words synced (faster-whisper: he said OK).
K. Ship: soak, two-browser run, errors, build, frame time; GAME_SPEC; then his playtest.

# DEAD AIR — the overnight plan (written 2026-10-16 03:10; playable by this evening, 20:00)

Order matters: the fixes he has already called first, then what makes the game (the cut-ins and scares), then the laughs, then
co-op, then the polish that makes it shippable. Every phase ends with a headless check and stills sent; nothing is committed
until he says. Times are my estimates.

## Phase 0 — the fixes already called (~40 min)
- The mic in the Warden's hand is on the wrong limb and flies about: trace `place()` in mobAnims.js, take the hand from the
  forearm's own placed matrix (or from the pose's foreR direction and the elbow), verify with a close still every 2 s of the number.
- The lamp and vent cut-ins are too short and their angles plain: the lamp becomes three shots (your lamp dying from in front of
  you, black with the stander's breathing, its face as the light comes back: ~2.6 s); the vent three (the grille banging, a pan
  along the ceiling with the scrabbling, the drop behind you over your shoulder: ~3.4 s). Every scare cut-in gets a second look at
  its angle (the sleeper from low, the Watcher's snap, the breath).

## Phase 1 — more scares, each with its cut-in (~2 h) — HIGH PRIORITY
- **The crawlspace** (#1): a vent hatch you can crouch into (a shortcut between the Spine and the Lab); halfway, something is
  coming the other way: a cut-in down the duct at its eyes, then it is on you.
- **The sleepers' round** (#4): one round (the 6th, or the Nightmare 4th) where every body on the floor gets up at once, the lights
  fading as they do; a cut-in sweeping the floor as they rise.
- **The Warden's hand** (#5): the Warden grabs instead of clawing: lifted off the floor, the cut-in is your boots dangling and his
  face; mash F to be dropped, or he throws you.
- Three cheap ones to thicken the mix: **the knock** (something hammers the door you are next to; it opens a crack, an arm comes
  through, the cut-in is the gap), **the hanging one** (a body hanging from a ceiling cable in the Reactor drops as you pass under),
  **the ankle** (a corpse you walk over grabs your ankle: a short grab from the floor, the cut-in looking down at it).
- The director gets them all in its list, by where you are.

## Phase 2 — the laughs (~1.5 h)
- **The boof backfires** (#7): one Golden BOOF in ten is a dud: 30 s of coughing, the dead stop to watch, one pats his back; the
  cut-in is the pat.
- **Zombie conga** (#8): hold the dance emote 6 s in the open and the nearest five line up behind you and conga until something
  breaks it (a shot, a claw from one not in the line); a cut-in from the front of the line.
- **The Mastre trophy** (#9): round 10: the PA announces Mastre of the Month, a gold Kirky statue drops from the ceiling onto the
  nearest zombie; the cut-in is the statue landing and Kirky's "...great."
- **The rubber chicken** (#10): a rare crate roll: a squeaking melee weapon, 1 damage, the dead flinch anyway; Kirky's line.

## Phase 3 — co-op (~1.5 h)
- Friends' Kirkys in the lounge and the open mic (their look, dancing beside you; on the stage with you for the finale), so every
  player is seen in every cut-in.
- The map scales with the party: from 2 players the Spine is two cells wide and the bay a cell bigger each way; from 3 the Lab
  and Med Bay grow too. Layout from zone rectangles, everything placed (core, uplink, crate, lounge, dock, openings, feeders,
  wall guns, corpses, vent, sleepers) relative to them; the host's party size at enter decides, guests get the host's.

## Phase 1b — level content (his picks, 2026-10-16 03:40) (~2.5 h)
Everything fits the story: the crew's last nine days, what they tried, what is left of it.
- **Observation Deck** (off the Med Bay side): a long window to the crater and the dome far off, the one quiet room; the uplink's
  dish is up here (seized: the crank QTE). A silhouette walks past the window, outside, on the surface, no suit.
- **Crew Quarters** (off the Spine): bunks, lockers, personal effects; a blanket that moves (a sleeper); the crew logs and the
  dead-man safe; the rubber chicken under a bunk ("FOR MORALE"); the blood writing.
- **Blood writing** on walls: warnings and jokes ("HOLD IT SHUT" over the barricaded doors, "DON'T OPEN MED BAY", "KIRKY WAS
  HERE?" dated nine days ago, "DAY 4" by the safe).
- **Blood trails** that lead somewhere: a log, a sleeper, the safe.
- **Steam bursts** as scares: pipes let go as you pass, a corridor whited out a moment, a shape in it (sometimes real).
- **Decompression** (the Arrival Bay's outer door: the crew tried to vent the dead; it half worked): see co-op.
- **The stalker**: silent, moves only while nobody looks at it, freezes mid-stride under your lamp; in co-op you cover each other's
  blind side (keep eyes on it).
- **The rubber chicken** (his model: dl/funny_rubber_chicken_-_lowpoly.glb): a melee weapon, squeak, 1 damage, they flinch anyway.

## Phase 2b — co-op mechanics and QTEs (all ten, his call) (~3 h)
QTEs share one language: a cut-in, one big key cap, a bar (mash / hold / alternate); a mild fail (a bite, a horde through).
- **Hold it shut**: a horde hits the door you are beside; both press E in rhythm (hit the green); let go and it bursts, an arm through.
- **Decompression**: siren, 10 s: everyone holds a rail (hold E, the bar drains); one can reach the override (mash F) to shut it
  early; the dead not holding on go out the door. Solo: shorter, just hold on.
- **Carry the downed**: hold E 2 s to lift a downed friend onto your back: slow, no shooting for you, they fire the pistol over your
  shoulder; to the lounge or to a revive. "Nobody gets left on this deck."
- **The uplink needs two**: the dish on the Observation Deck is seized: one cranks (alternate A/D), the other keeps the Med Bay
  console alive. Solo: pre-set by a dead crewman (his log says so).
- **Strap in**: the shuttle is in: everyone to a seat (E) within 12 s as they pour through the bay; the last aboard closes the hatch
  (mash F): the hatch coming down on a hand.
- **Keep eyes on it**: the stalker, as above; the HUD shows whose eyes it is under.
- **The dead-man safe**: three of the logs behind a two-key panel: both press E on two plates within a second ("after day four").
- **Revive together**: mash F together, half the time.
- **Back to back**: two within arm's reach facing away: a damage bonus and the cut-in; the dead come from every side anyway.
- **The core needs two hands** (4 players): the fuel rod from Cold Storage carried to the Reactor by two (each holding E); dropped,
  30 s to recover it.

## Phase 4 — the song's words (~40 min, needs his OK)
- Transcribe show_song.ogg with faster-whisper (pip install, ~75 MB model) for word timestamps; align the lyric cards to them.
  Without the OK: he gives me the rough times of the first word of each line, and I set them by hand.

## Phase 5 — shippable (~1.5 h)
- Soak to round 5 with the bot (nothing stuck, nothing teleported, scares firing); a two-browser co-op run (host and guest: the
  entrance, an objective, a grab, the lounge, the show, a cut-in on each side); errs clean; `npm run build`; frame time in the
  lounge with the crowd and confetti (cut the fans' detail if it drops under 50 fps).
- His call on doors across Again (kept, or reset as now).
- GAME_SPEC.md, the memory, this file; then his playtest in the morning and the fixes from it.

## Open questions for him
1. ~~faster-whisper for the lyrics: OK to install?~~ He said OK; installed and used (tools/sync_lyrics.py).
2. Doors kept open across Again, or reset? (still reset, as before)
3. ~~The place scares were each browser's own~~ — now shared (see above). The recorder stays local (it is only sound).

---

# DEAD AIR — what to do next (written 2026-10-16, before the weekly limit)

Everything below is uncommitted in the working tree (nothing of DEAD AIR has ever been committed). It all runs: the last
checks were clean (`da/errs.mjs` no console errors, 3-minute soak to round 4, two-browser story test, `npm run build`
→ `deadair-*.js` 169 kB). To lock the work in before anything else: `git add -A && git commit` (no co-author line in this
repo; `dl/` is git-ignored; `REUSABLE_SYSTEMS.md` and this file stay untracked unless you want them).

## Done 2026-10-16, 04:00-05:40 (after the summary)
- Co-op, all ten: hold it shut, decompression, strap in (verified solo); carry the downed (F held a second on a downed friend: on
  your back, slow, no gun; F again sets them down; drawn on the carrier's back for everyone), revive together (a second pair of
  hands halves it), the uplink needs two (with friends the dish only turns while one of you cranks A/D at the wheel in the Med
  Bay; solo as before), keep eyes on it (the HUD says whose eyes the stalker is under), the dead-man safe (the Lab's south wall by
  the Reactor door: E on one plate, the other within 1.2 s; two of you, or one at a sprint; opens on day-four's log, 300 pts),
  back to back (two within arm's reach facing away: +25 % and a cut-in), the core needs two hands (four of you: two at the core
  to prime it). Editor stages: safe, crank.
- **Two levels** (his ask): the Med Bay is 5x3 + a nook, 8 m tall; the Observation Deck is a floor up along its south side
  (parapet to look and shoot down over, windows onto a painted Moon with the Earth up, 'LOOK UP'); a stairwell of two kit flights
  from the nook; the Crew Quarters past a 1500 door east of the Reactor (bunks, lockers, footlockers, 'SHE WAS RIGHT',
  'DAY 6 · THREE LEFT'); the Reactor one row bigger and 8 m tall; kit glass see-through; strips hang on rods in tall rooms. The
  dead path up the stairs (verified), drop out of the deck's window, the walker climbs/descends. Stages: deck, stairs, quarters, medbay.
- **The reload skit**: one mag reload in ten (a zombie in sight, 1.6-14 m): the fresh mag slips, lands lit at his feet
  ("...Oh, come on."), the nearest one walks over, picks it up (rummage), brings it, holds it out (throw clip, frozen),
  he takes it ("...Thanks.", COURTESY card, +50), it stands a second and is itself again. Reload resumes from the belt. Stage: skit (press R).
- **The rubber chicken**: under the first bunk in the Crew Quarters (squeaks when you are near): E takes it, a cut-in, and it
  goes on the end of his gun (CHICKEN BAYONET): F hits 1.6x, throws them 1.8x, and squeaks. Stage: chicken.
- Test hooks: `deadAir.test({ calm: true })` stops the rounds; `reload: true`; `deadAir.skit`, `deadAir.chicken`.
- **The laughs, the rest** (~06:30): the boof dud (one Golden BOOF in ten: no hour, half the charge back, six seconds of
  coughing ('drunkidle'), the three nearest stop to watch, one pats his back; "...I'm fine. Shoot something."; stage dud, G),
  the conga (dance T six seconds with the dead about: the nearest five line up behind you along your trail, hopping on the beat,
  until a shot, a swing, a claw from one not in the line, the lounge or 30 s; +25 each; stage conga), the Mastre trophy (round
  ten: the PA 'pa_mastre.wav' (Zira), then a gold Kirky (a second SkaterModel, gold material) out of the ceiling onto the nearest
  of them: crushed; it stays as a prop with a solid box; "...Great."; +500; stage trophy). dead.js draws `z.hop`.
- **The song's words** (~06:10): `tools/sync_lyrics.py` (faster-whisper small, PyAV decode by hand) timed the cards to the
  recording: "Hold up" at 10.8 s, the verse 29.6-53.3, the chorus 56.8-70.1, the bridge line 75.1, GOY/BOOF 80.3, the second
  chorus (growled, not transcribed) from 84 at the first chorus's spacing, the end at 97.6; SEC sections moved to match.

- **Two-browser run** (~07:00, da/coop5.mjs, coop6.mjs): the crank gates the signal (k frozen until the host cranks; the guest
  sees `ck`), back to back +25 % on both, carry (the host follows the guest 7 m, drawn on their back for everyone), set down,
  revive. Friends in the lounge: the casino room's own `showOthers` now takes DEAD AIR's party (casino `enter({ others })`,
  lounge `friends`, STATE lx/lz/ly/em): each sees the other's Kirky in the room, dancing on the stage if they are.

- **Cheap scares, by place** (~06:10, his "add a LOT of cheap ones"): the window (on the deck: a silhouette walks past the
  glass with the Moon behind it), the parapet (Med Bay, round 2+: one leaning over the deck's edge, then over it and down into
  the room), steps overhead (six slow ones on the deck, a tilt-up), the bunk (the quarters: a body under the second bunk's
  blanket moves; three seconds later it gets up at the foot of the bed), the one on the stairs (sitting at the top with its back
  to you; turns when you are three metres up: "...Hey."), the drip (blood off the parapet edge onto the plates, with its tick).
  Each once a run, each with a one-shot cut-in; stages window/parapet/overhead/bunk/sitter/drip; `scares.force(id, me)`.
  Cut-ins on the deck are lifted with the floor (runCut). The relief: entering the lounge, a breath out and a warm chord
  (`sound.relief`), the first time "...Okay. Okay."

- **Ship checks** (~06:30): errs clean; `npm run build` ok; fps 57 (the headless cap) in the bay, round 8 (35 alive), the
  tall Med Bay, the deck and the whole open mic; the show's 5.7 s first-frame stall found (shaders) and removed (lounge
  `warm()` in prepare: renderer.compile with the room's hidden meshes shown); the 5-minute bot soak reaches round 3 with no
  errors (a hanging one and the sitter no longer hold a round open: they come down on their own when last, or after 70 s).

- **The Spine, two cells wide** (~06:45, his "too small for multiple"): a row north of it (cells 8-11 x 1); the wall gun, 'HOLD
  IT SHUT' and the (8,2) spawn moved to the new row's wall; the dead path through it; stills da/sp_*.png.

- **Hitches** (~06:20): the station's shaders are compiled before the entrance (`warmScene()`: hidden meshes shown for a
  `renderer.compile`), the lounge's in prepare: the 1.9 s freeze at the intro's end is gone; what is left (0.7 s and 1 s) sits in
  the black before the first shot. Editor stages put a finished game away (`runStage` clears over/won).

- **Four more cheap scares** (~07:10): the footlocker (quarters: its lid flies open with a bang as you pass; off and not
  looking, it slams shut), the wheel (Med Bay, alone: the crank turns a turn and a half by itself, clanking: "...Nobody is on
  that."), the missing body (round 2+: a corpse you are far from and cannot see sinks away; back in sight of its blood:
  "...It was right there.", a groan behind you), the recorder (one of Jun's untaken recorders plays by itself from another
  room, its LED up, until you reach it: "...Who's playing that?"). Stages chest/wheel/gone/recorder; `scares.force(id, me)`
  takes a `forced` flag that ignores the distance rules. The chicken on the gun is 9/ws (about 60 cm long).

- **The bunk, redone** (~07:25, the sculpted standard): a real corpse (dead.corpse, id -150) lies on the second bunk under a
  draped cloth (a displaced plane: humped over the chest and legs, hanging over the slab's edges, blanketTexture); the scare
  moves it under the cloth, throws the blanket over the edge onto the floor in a heap, and what was under it rises at the
  bedside ('bunkUp' cut-in from along the bed: "...Nope."). `scares.bunk` for tests.

- **Spine fixes** (~07:30): the wall gun is back at (7,2,'n') (it had been moved onto a rock cell), the two steam spots that
  sat on the wall the widening removed are on the new north wall (z 2.44), a strip at (9,1). Build OK.

- **Final checks of the morning** (~08:00): lone soak to round 3 (the hanging one in the tall Reactor at y 6 lets go on its
  own), coop5 and stagesall pass, build OK, errs clean.

- **Place scares shared** (~08:10): chest, wheel, bunk and the missing body happen for the whole party: whoever sets one
  off raises a 'net' event → `{ da: 'scare', k, x, z }` (guest → host → all); `scares.mirror(id, m, me)` applies it (the
  cut-in only if you are within 9 m of the place; the riser of the bunk is the host's spawn, synced as the dead are).
  Verified with two browsers (da/coop7.mjs): the guest's lid opens with its cut-in; the guest's corpse goes too.

- **The song's second chorus** (~08:30): whisper medium hears it: 'He hit that boof' 88.6 s, the last BRAINS 96.4 s; cards
  retimed (87.8 / 91.3 / 94.3 / 96.4; the assumed 84.0 was four seconds early), SEC mosh 80.4-87.8, surf -94.3, finale -100.5.

- **The show's end card** (~08:50): it came up at 92 s, over the retimed last cards; now at 98.4 s, after the last BRAINS,
  and no lyric is drawn under it (lounge.js runShow). Verified through the number (da/show.mjs: cards at 89/95/97, the end
  card alone at 99, Kirky's line at 101).

- **Long lone soak** (~09:10, da/soak9.json, 9 min): the bot reaches round 5 (116 kills, 29 alive at the peak of round 4,
  sprinters vaulting the crates), rounds never stall, no errors.

## His review of 2026-10-16 09:00 (3/10): what was done for it (09:10 →)
- **The entrance, from the Moon** (his 2/10): the Moon's lift scene is now 14.8 s: the last one rolls in to the others under
  the lamp, the gate shuts on the Moon, the walls start to slide, his face in the red, the square of the top going away. The
  station's way in (26.6 s, was 15.4): from the bay floor up the shaft at the cage's lamp coming down; inside the cage with
  them at the rails ("Deck C in five. Mind the stop: the brake is not what it was." / "Four. Three. Two."); the slam, a flash,
  black; the heap on the plates ("...Mind the stop, he said." / "...No board. Great."); the faces as the lamps click on
  ("Everyone up." / "Lamps." / "The lift is going back without us. ...Of course it is."); the lighter; NINE DAYS; wide from
  across the bay with the lift behind them; the title. The cage then really leaves (lift.js): it is gone until the signal.
- **The lift** (src/deadair/lift.js): the cage at the west end of the Arrival Bay under a 34 m shaft with a hatch and the
  stars past it; a lever inside, a call panel and a signpost (LIFT · THE WAY OUT) outside, a runway of floor lights; its rails
  are solid while it is down. Dock 1 and the shuttle are gone from the story: the signal brings the lift back (its own
  11 s cinematic: up the shaft at its lamp, inside the empty cage coming down, the landing, the gate, the runway, "The lift.
  Everyone in. Go."); boarding = E at a rail, the last one mashes F on the lever.
- **YOU GOT OUT** is a cinematic (13.4 s): the lever, the gate shutting on three sets of arms, the cage lifting off the bay
  floor, inside with him at the rail and the strips streaming down, the hatch opening on the stars (THE SURFACE), white.
  Then the card: Again / **To the surface** → main.js backToMoon(): Free Ride again, and `cutscenes.surface`: the cage
  rising through the shaft (15.4 s), breaking the ground by the sign, the gate opening on the Moon, Kirky rolling out
  ("...Never again. ...Same time tomorrow?"), wide with the dome and the Earth.
- **Scares no longer take the camera**: the glance (`glanceAt`, `runGlance`): the view is pulled toward the thing for a
  second, hard at first and easing off, speed lines, his line on the subtitle; the camera stays yours. The director waits
  24 s then 32–55 s between scares (was 14 / 20–34); the wheel/missing body/recorder chances halved.
- **Scares leave the view alone (his call, 2026-10-17)**: `SCARE_CAMERA = false` in `index.js`. No glance (the pull and its
  speed lines), and no cut-ins on the doorstep (it still waves, he still says "...Hi.", then it screams and comes) or in the
  crawlspace (his two lines on the subtitle instead). The sounds, his lines and the banners stay; the grab's cut-ins are
  untouched. da/scarecam.mjs: nine scares, no cut-in, no speed lines, the view still. `true` brings it all back.
- **A cut-in can never kill you**: `me.shield` while any cut-in, the skit, the dud, the conga, the trophy's fall or the
  Golden BOOF has you: no claw lands, no grab starts, the dead stop targeting you.
- **The first room is safe**: no openings in the Arrival Bay (all spawns moved to the Spine and beyond); nothing wakes until
  you leave the bay (the 90 s timer is gone).
- **Decompression** is the shaft's top hatch failing with the cage up: the siren, the hatch sliding open on the stars, dust and
  scraps streaming up the shaft, the dead in the bay pulled under it and flung up it and gone (they have nothing to hold);
  you hold a rail or get pulled up into the shaft and dropped (30 off); the call panel by the gate shuts it (F). Cut-in up the
  shaft; SEALED at the end.
- **The grab** uses his Zombie Neck Bite clip (mob_anims 'neckbite'); the reload skit's pick-up uses his Unarmed Grab Torch
  From Floor clip ('pickup'); the skit is ~6–8 s (was 12–15). **The conga** starts after 2.5 s of dancing and the line rallies
  (arms up) as it walks. **The dud** is four clear shots (his face / wide from behind with the dead walking up / the pat in
  profile / his face, the line). **The trophy** is three (over his shoulder at the one it is for / over his shoulder wide as the
  gold comes down, a flash as it lands / where it landed, rising to him).
- **The rooms**: the ceiling gap is gone (the kit's top piece is modelled 3 m up its own origin: placed 3 m lower); the
  stairs run the right way (the kit's flight is high at its own end); every door has a sign on both faces (LAB 2 · SEALED · 750,
  OPEN once it is) and a banner with the room's name comes up the first time you walk in; the crawlspace hatches have a sign
  (CRAWLSPACE · MAINTENANCE · E TO ENTER) and a blinking amber lamp, and the camera drops onto his belly over half a second
  instead of being there at once; the blood writing and the blood sit on each wall piece's real face (faceOf/faceAt); the
  Observation Deck's windows look out on the real Moon (moonHeight + the regolith texture, 24 m below, sunlit) under the
  painted sky with the Earth.
- **Low gravity** is 0.55 (was 0.3) and the ceiling stops him (walker clamps y under ceilAt).
- **The round-1 freeze**: not reproduced (150 s with the bot, 6 frame gaps all under 1 s), but the two heavy builds are moved
  off the first minute: the lounge is built while the difficulty card is up, the station's shaders are compiled before the
  entrance (`warmScene`), the lounge's in `warm()`.
- Test hooks: `deadAir.test({ freeCam: [x, y, z, tx, ty, tz] })` puts the frame's camera anywhere; `deadAir.lift`,
  `deadAir.exiting`, `deadAir.cutIn`; `deadAir.out()` leaves to the Moon. Drivers: da/liftbay.mjs, roundtrip.mjs (the whole
  way, both ends), pass2.mjs, pass3.mjs, glance.mjs, freeze.mjs, board2.mjs.

- **The heap, really down** (12:5x): a `play()` from story.js never showed, because walker.update (and party.update) play
  their own clip and pose the body before the entrance runs: the heap now goes through `walker.forceClip` /
  `friend.forceClip` (party.js honours it), cleared at entranceDone. Verified flat on his back at fallover 1.98.
- Rule for cinematics on Kirky's model: a clip told from outside the walker must go through `forceClip`, never `k.play()`.

- **Decompression, the dead first** (13:0x): the pull on the dead is 34 (was 22) against the players' 9, and the players
  feel only 4 for the first three seconds: the bay's dead are up the shaft before you are ever dragged.
- **Four players, the core** (13:0x, da/core4.mjs with three faked friends): "The rod takes two hands · 1 of 2 of you at the
  core" until a second one stands at it; then the prime offer. Verified.

- **Entrance framing, final** (13:1x): the heap from just inside the lift's open gateway, low, past his head (he is flat on
  his back, the cigarette's smoke going up); the faces from in front of the line, a little under face height. The objective
  cut-ins are three shots (his face and the word / the place and the title / the party seen from it with where to go):
  intro 7.4 s, done 4.8 s (two shots: the place lit, his face). Four players at the core verified (da/core4.mjs).

- **Writing never on glass** (13:3x): a wall that carries her writing is always a solid piece (DON'T OPEN MED BAY was on a
  window pane). Final checks: all 63 editor stages clean, errs clean, build OK, the full round trip Moon → station → out →
  Moon passes (da/roundtrip.mjs).

## 12:09 incident: index.js zeroed on disk (recovered)
At 12:09:43 `src/deadair/index.js` became 189 KB of NUL bytes (an OS-level write loss: no process of mine wrote it then).
Recovered from a leftover headless-Edge profile's HTTP cache (`%LOCALAPPDATA%\Temp\shots-*\Default\Cache\Cache_Data_*`:
the dev server's transformed module carries an inline source map whose `sourcesContent` is the file as Vite read it, with the
imports rewritten to `/src/...?t=` and `/node_modules/.vite/deps/...`; un-rewritten back to `./x.js` / `../x.js` / `'three'`).
The newest cached copy was 10:40 (post-batch52); the three later edits (introT, gild/exit/trophy, flash/crawl) were replayed
from the transcript, and batch52's objective-cut-in `region()` edit (which that batch's own final write had overwritten) was
applied for the first time. `dl/backup/` now holds snapshots of src/deadair, cutscenes.js, main.js, airlock.js (12:42) and the
restored index.js. Lesson: nothing of DEAD AIR is committed; a commit is the only real safety net.

## In flight (stopped mid-way, safe)
- `tools/build_zombies.py` was rewritten to keep the zombies' real textures (it used to sample the 2k skin down to one
  colour per vertex: that is the quality drop you saw). **It has not been run**, and the loader does not yet understand its
  output. Do not run it before step 1b, or the second piece of a two-picture part (`zombieb_head2`) overwrites the first.

## 0. Done since this was written (2026-10-16 night)
Title-screen DEAD AIR button removed (editor keeps "Play DEAD AIR"); his nine Mixamo clips built into kirky_anims.glb and used;
the arm no longer freezes (freeArm only for the dance); grab really holds (it used to drop the same frame) and others cannot hurt
you meanwhile; Again keeps Normal/Nightmare (it used to lock the game); rounds cannot stall; the Spine's missing wall piece;
the bay is 6x6 cells; openings darker.
Later the same night (his second list): invisible walls (slab overhang only where a wall continues); teleports (only unseen stuck
zombies move, back in through an unseen opening); Esc is a pause menu (never quits); pistol at rest uses 'idle'; melee plays the
whole riflemelee clip with the gun in hand, hit at 0.38 s; Space jumps / vaults crates (his Vault Over Box clip) / climbs onto them;
zombies vault and climb too (slower); Golden BOOF charged by 25 kills, 7.6 s cut-in with "Hold up. Let me hit that boof." and the
big puff, 30 s; the crate is a beacon (beam, rings, sign, hum, HUD marker); zombies capped under walking speed; difficulty eased.
Still open from that list: real sounds/music off the internet (a CC0 list was put to him for permission).

## 1. Zombie textures (the standard; do this first — the video in step 2 must be recorded after it)
a. Run: `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --python tools/build_zombies.py -- dl public/models/zombies.glb`
   (sources: `dl/Crouched To Sprinting.fbx` zombieb, `dl/Sprint.fbx` zombiec, `dl/hamzitus goyitus.fbx` boss, `dl/rubistus goyitus.fbx` boss2;
   each has a diffuse + normal map, 2k/4k; the script shrinks them to 1024/512 JPEG and names materials `zombieb|1.9`: the
   gain the game lightens him by). Check the output: `images > 0`, `TEXCOORD_0` in primitives, size (expect ~3–4 MB).
b. `src/enemies/realMobs.js`: `found[name][fine|lite][part]` must become an **array** of meshes (a part painted on two
   pictures is two objects: `_head` and `_head2`; the regex already strips the digit). `plain(mesh)` must keep the real
   `uv` (it zeroes it now) and the part entry must carry `map: mesh.material.map, normalMap: mesh.material.normalMap,
   gain: +mesh.material.name.split('|')[1] || 1`. `make(set)` emits one entry per mesh (same pivot/swing/phase for both).
b2. `tools/slim_models.py` RULES: `zombies.glb` drops `TEXCOORD_0` — remove that for zombies.glb, or the UVs are stripped
   after the Blender run and the maps cannot show.
c. `src/deadair/dead.js` `set()` (line ~77) and `src/enemies/horde.js` build (line ~182): when `p.map`, use a
   `MeshStandardMaterial({ map, normalMap, color: new Color(gain,gain,gain), roughness: 0.8, side: DoubleSide })`
   **without** vertexColors (else the baked colour multiplies the map), cached per `map.uuid` so parts share. Instance
   tints (`setColorAt`) still apply. `knees.js` spreads `...p` for thighs (keeps map) but builds shins/forearms fresh
   (lines 68, 78, 98): add `map: p.map, normalMap: p.normalMap, gain: p.gain` there.
d. Verify: `da/run.mjs` with a "nine zombies close" step (like `lod.json`) + the lounge band (`lounge2.json`), the main
   page `errs.mjs`, `npm run build`. Expect skin pores/cloth detail instead of flat colour. Send stills.

## 2. The open mic as a recorded video (his ask: record the cut-in, save it, play the video on trigger)
- Record the live cut-in once (after step 1): in a browser page, `renderer.domElement.captureStream(30)` +
  `MediaRecorder` (video/webm;codecs=vp9), trigger `deadAir.loungeShow()`, stop after 16.5 s, save the blob →
  `public/video/deadair_openmic.webm` (1280×720, expect 6–10 MB). The headless driver can do it (`page.eval` + a
  base64 download); audio is not needed in the file (the lounge trio keeps playing live underneath).
- Playback: a `<video>` inside the HUD's `.cine` layer (hud.js), muted, fullscreen, `hud.video(src, onEnd)`;
  `lounge.startShow()` plays it instead of `runShow` and spawns the band at its end (keep `runBand`, the band must still
  play on after). Keep `runShow` as the fallback if the file fails to load. Stings off `video.currentTime` if wanted.
- The station-side concert code is gone already; the lounge version lives in `src/deadair/lounge.js` (`STAGE`,
  `startShow`, `runBand`, `runShow`, `clearStage`).

## 3. Every player must dance (co-op trigger)
- The lounge is per player (`friends: false`), so the condition is: everyone in the party is on their own stage dancing
  for 4 s at once. `lounge.js`: expose `get dancing()` (on stage && `room.emoter.playing === 4`). `index.js` `myState()`:
  add `mic: lounge.dancing ? 1 : 0`; `party.js` `list()`: pass `mic`. Host, each frame: if every `everyone()` entry has
  `mic` (me via `lounge.dancing`) accumulate `micFor += dt`, else 0; at 4 s → `lounge.show()` + `tell({ da: 'mic' })`.
  Guests: `case 'mic'` → `lounge.show()`. Solo: unchanged (local 4 s). HUD prompt while dancing alone: "waiting for the
  others". Remove the local `danced` trigger in `lounge.update` when in co-op (host decides).
- Test with `da/coop2.mjs`-style driver: both browsers `goIn()`, both `room.emoter.play(3)` on the stage for 5 s, expect
  both to get the show; one dancing → nothing.

## Done 2026-10-16 afternoon: Free Ride on foot, and a housekeeping pass
- **Free Ride on foot** (his ask: "a button to get off the board and start walking/running"): `src/player/afoot.js`. B steps off
  (board flicked onto his back), walk / run / hop / back off with DEAD AIR's clips, B steps back on. Main loop: `afoot.step()` in
  place of `skater.update()`, `afoot.pose()` in place of `model.update()`; chase camera `free` / `foot`; friends via the `foot`
  field in ride.js's STATE. The board on his back hangs on `model.hung` (kirkyBody's chest-bone hanger); its place was solved
  from his posed skin (`da/back_profile.mjs` + `back_fit2.mjs`): he bulges to ~0.46 m behind his spine at the waist, so it sits
  high and steep, nose over his right shoulder, 0.255 m off the spine. Bones must be read with `setFromMatrixPosition(matrixWorld)`
  from the drawn body's skeleton (`getWorldPosition` recomputes them wrongly; the first `spine_03` found by traverse is a hidden body's).
  Tests: `da/afoot.mjs`, `afoot_close.mjs`, `afoot_lift.mjs` (R and the lift put him back on).
- **Housekeeping:** the knock's "hold it shut" was lost when the scare cut-ins became glances: restored in `cutScare`. Removed dead
  code (`cutScareCinematic`, `alivePlayers`, the lounge's film loader, `DOCK`). The old concert film (7.3 MB, never played since the
  show was retimed) moved from `public/video` to `dl/video`: the build is 48 MB. `fx/singlePass.js`: see-through two-sided
  materials are drawn in one pass (three.js drew them twice and re-checked their shaders every frame); swept every 2 s in main.js.
  Profiles (`da/profile.mjs deadair|freeride [stage]`, a DevTools CPU profile; shots.mjs now has `page.send`): ~55 % idle at
  55 fps in both; shaders settle at 118 programs in Free Ride (no leak). Not done: the 71 WAVs (11 MB) could be OGG/MP3, but
  there is no ffmpeg here. (With a long gun his idle stands him side-on to where he aims: his back is then to his right of the
  aim, which is where his pack and board hang. That is right, not a fault.)

## Done 2026-10-16 late afternoon: the lift scenes, framed shot by shot (his ask: stills of the lift at the start and the end, and the bay)
- `da/req2.mjs` captures all five by each scene's own clock (`game.cutscenes.info.time`, `deadAir.introT`, `deadAir.cutIn.t`);
  `da/cs_probe.mjs <lift|surface> t…` seeks a Moon scene for quick framing checks (it skips shots' `at` cues, e.g. the shaft hiding).
- The Moon's lift (cutscenes.js): the shaft (`makeShaft`) is now 120 m walls whose top starts level with the ground and climbs
  away (down) or comes down to meet the cage (up, `arrive` s), red light fixed on the cage, never hidden. The roll-in is two
  shots: high alongside him (the post with the sign stands ON the runway's line, boulders either side of the gate: cameras go
  high, or on the runway's line), then behind him over the rails into the cage. Cutscenes now drive the gate (`airlock.setGate`):
  nothing updates the lift while a scene plays, and it had been rolling him in through a shut gate.
- The surface: a look up past him at the shaft and sky (the cage's floor is plate: there was nothing to see looking down); the
  stop on his face under the Earth (aimed over his head: `onFace` pulls a camera aimed at his face back along its line); he rolls
  out and bears off the runway, so Free Ride's camera behind him has neither the cage nor the post in the way (the green blob
  was the cage's lamp, filling the camera that was left inside the cage); the wide cranes up over the ramps.
- The way out (index.js): his model is carried up with the cage (`walker.carriedY`: the ceiling clamp held it under the bay
  ceiling); the cut-in's wall check is skipped for cameras up the shaft (`station.ray` from above the ceiling says no room); the
  lever shot is over his shoulder, kept inside the cage; the bay-floor shot from out in the bay, low; the cage light softer.
  Editor stage jumps no longer replay objective cut-ins (`objQuiet`), and the board stage powers the station as play would have.
- The arrival (story.js): before the slam, from under the shaft up at the cage coming (from the bay the ceiling hid it);
  NINE DAYS from 3.4 m so both words read.

## Done 2026-10-16 night: his music, and the housekeeping run
- **His Suno audio** (dl/Audio) is in: `tools/master_audio.py` cuts, fades and levels; the browser decodes (Blender reads
  neither mp4 nor webm) and WebCodecs encodes AAC. DEAD AIR's `sound.music` (sound.js): loops dread / hunt / swarm / lounge
  with 4 s crossfades, chosen by `runMusic` (index.js); cues with a clock that the way in (`runIntro`) and the way out
  (`exitCinematic` + `playCut(..., 'cue_way_out')`) follow, measured drift under 0.02 s; jingles on power / signal / the lift
  down; stingers and a grille bang on spawns (`spawnNoise`); laughs in the quiet; ducking under the PA. The Moon's lift
  scenes play `cue_moon_down` / `cue_moon_up` (fx/score.js). Reverb down (1.5 s tail, 0.28), zombies louder and drier, their
  steps recorded; his steps get kit foley. `music_paranoid.mp3` retired to dl/retired.
- **The way in** got a quiet shot (a second drag, the smoke in his beam) in the cue's silence, so DEAD AIR lands on its hit
  at 36.3; 39.3 s in all. **The way out** is 21.4 s, cut to its cue: the dead at the doors from the bay with a snap in on the
  slam (1.74), the cage lifting, inside, down through the cage's grille roof ("Nobody look down"), THE SURFACE on its hit,
  a low shot on him under the open hatch, the white on the big hit (20.36).
- **Housekeeping (19:30 run):** node --check clean on every deadair file, airlock, cutscenes, main; the error sweep clean;
  build fine (deadair chunk 323.3 kB, 114.3 kB gzip). The 3-minute bot soak found a runner wedged for good in the Arrival
  Bay's corner: the (1,1) hole opened into a pocket between the west wall, a crate and an offset stack too tall to vault.
  The crates now stand off the wall as one block, and a zombie that means to move and has not for 1.6 s steps aside along
  what it is against (dead.js `aside`). After: rounds 2→3, ~26 kills, no teleports (him or them), nothing wedged but the
  scripted hangers in the Reactor. The scare director fired the lamp (twice), a flicker and the vent in 110 s. The open mic
  holds 60 fps in headless (one 5 s window at 55 in one run; a single 446 ms frame once, not seen again; no shader compiled
  mid-show), so the fans keep their detail. Dead code out (the old crank's key state, `NO_DIR`, `knockDoor`, the airlock's
  unused material, `trophyDone`, the unused `testing.fumble`); stale comments brought up to date; the editor's stage list
  shows each group once; all 60 stages run clean (stagesall.mjs). Not committed.

## Done 2026-10-16, last thing: the lock, his tracks, the sound budget, the balance pass
- **The Moon lift's lock** (src/freeride/lockout.js): a lockout over its call button (a hinged hazard cover, a laminated
  padlock through its hasp, a DANGER tag), shot off: it snaps, drops to the dust, the cover swings up, the lamp goes green. The
  shot is tested along the camera's line (main.js `lockAim`): the sniper's beam leaves the muzzle half a metre off it and
  passed the lock by however true the aim (his "the lock cannot be shot"). The "lift is locked" line is gone.
- **His seven tracks** (title, Cemetery, Catacombs, Free Ride, House, Long Way Down, boss): tools/master_loops.py, fx/music.js
  TRACKS; the menu plays the title. Loop joins scored by rhythm and tone (0.46 to 0.81).
- **DEAD AIR's sound budget, v2** (his: still cutting out with a crowd; very conservative, music first, then the nearest dead,
  then the station): sound.js `admit` / `admitOwn`: 4 voices, 3 steps, 3 hits, 2 hit layers, 6 others, 2 of the station's own
  (none while one is close), 12 placed at once, 26 one-shots at once in all, 5 new a tenth of a second, HRTF for the 3 nearest
  within 9 m; their feet one source a step; no reverb send for the dry; every api call can never throw into the game.
  Under a crowd with the machine gun (da/stress.mjs): sources alive at once 98 -> 34 -> 27 (one-shots ≤ 24), panners made a
  second 140 -> 14-35, errors 0.
- **Balance pass on the normal levels: applied, with the synergies, at his word** (see GAME_SPEC.md, Builds; after he had
  it stopped once, and asked for it back). Checked in the game (da/synergy.mjs): with nothing held no build card is dealt; with
  Ring of Fire every hand has one, Open Wounds in a quarter of them; with Fire and Frost, Thermal Shock in a fifth; Thermal
  Shock taken (as first made: since trimmed to +30%) fire did 17.5 against 10; a HotBox capture brings up its pick of three.
  Then tuned so it is not too easy (his ask): da/power.mjs, see GAME_SPEC.md Builds for the numbers. Not yet played
  through a whole level with it (the bot's run was stopped). What the bot found before it, in one run of the Cemetery
  (da/balance.mjs, `game.testGod`): the XP cap of 20 reached at 2:40, before the boss; the gun's DPS 9.6x against monsters
  1.9x tougher; 23 chests a level, almost all consumables.

## 4. Still waiting on him
- Gun models (`dl/deadair/guns/`) and Mixamo reload / stab / rifle-butt clips (`dl/DOWNLOAD_LIST.md`), then 2 h to wire.
- His FPS number for a deeper performance pass (the strip lights are already pooled 9→4).
- Kirky's voice: ElevenLabs refused his account's free tier; the PA speaks with Windows' Zira. He can upgrade or record.
- His Suno tracks for the title screen and each level (prompts: dl/Audio/SUNO_LEVEL_PROMPTS.md and the title prompt in the
  chat): to be cut into loops and put in place of fx/music.js's generated styles, level by level.
- His ear on the new mix (the headless browser is muted: the timing and the triggers are checked, the levels are not).
- The mouse crank is still unverified headless (`testing.crank` drives it; he said skip it).
- The commit, when he says.

## How to verify anything (scratchpad drivers, `…\scratchpad\da\`)
Added 2026-10-16 (all `node <file>` with the dev server up; one at a time — several headless browsers at once starve the
game's clock (dt is clamped to 0.05 s) and timers such as the 90-s bay wake never come):
- `errs.mjs` (console errors on entry), `stagesall.mjs` (every editor stage, errors per stage), `perf.mjs` / `perf2.mjs` /
  `perf3.mjs` (fps by place; the show's first frame; hitches on entry), `run.mjs soak6.json` (5-min bot to round 3).
- `qte.mjs` (hold it shut / decompression / strap in), `coop2.mjs` (safe, crank, the eye), `coop5.mjs` (two browsers: crank,
  back to back, carry, revive), `coop6.mjs` (two browsers in the lounge).
- `levels.mjs` / `levels2.mjs` / `levels3.mjs` (the two levels, stairs, a zombie climbing), `spine.mjs`, `gunwall.mjs`.
- `skit.mjs` (the reload skit and the chicken), `chick2/3/4.mjs`, `laughs.mjs` / `conga.mjs` / `trophy.mjs`.
- `cheap.mjs` / `cheap2-4.mjs` (the place scares), `bunklook.mjs` (the bunk sequence), `crank.mjs`, `cheap4.mjs`.
- `sheet.mjs out.png "title" a.png b.png …` makes the contact sheets sent to him (dl/shots/).
`node run.mjs <steps.json>` opens `localhost:5173/?deadair` (dev server: launch entry `deadglide`, port 5173) and runs
`{ eval, wait, shot }` steps; evals must be single expressions. Hooks on `window.deadAir`: `test({ god, aim, fire, melee,
dance, golden, g, keys, cam })`, `openDoor(i)`, `story.begin('power'|'signal')`, `story.pa(i)`, `watcher()`, `grabMe()`,
`grabWho(id)`, `chip()`, `offer()`, `pickHard(h)`, `ask()`, `goIn()`, `loungeShow()`, `lounge.room`, `lounge.prompt`.
Added 2026-10-16 night: `music.mjs` (the way in on its cue, the loops by state), `mu_in2.mjs` / `mu_out.mjs` (stills of
the retimed way in and way out by their clocks), `mu_ev.mjs` (laughs, jingles, bangs, stingers: `deadAir.music.log`),
`mu_moon.mjs` (the Moon cues load), `run.mjs soak2_tp.json` (the soak with a teleport / wedge / progress watcher; it wakes
the station first: the bot never leaves the bay), `wedge.mjs` (the bay corner), `perf_mic.mjs` / `perf_mic2.mjs` (fps
through the open mic; hitches and new shader programs).
`coop2.mjs` (two browsers through the Moon hatch, the whole story), `coop3.mjs` (the grab), `soak2.json` (3-minute bot),
`errs.mjs` (console errors on the main page + entry), `decode.mjs` (every sound file decodes). Never edit `src/` while a
driver runs (Vite reloads the test browsers).
