# DeadSlide: what the game is

This describes the game as it stands. It replaces the original build plan, which the game has long outgrown.
Numbers quoted here are the defaults; almost all of them live in `src/config.js` and can be changed live with the tuning panel.

## In one paragraph
A 3D browser arcade game for a small group of friends. You are Kirky, a skater with a gun. You ride a momentum-based
board through a haunted world, pulling tricks and shooting waves of monsters, levelling up as you go, until the level's
boss arrives. Kill him, reach the exit portal, and the gold you picked up is banked. Gold buys permanent upgrades, guns
and cosmetics in the shop, or gets gambled in the casino. There is also Free Ride: a skatepark on the Moon to share with
friends, with no damage and no clock. Everything is made in code: there are no art or audio files.

## Tech
- Three.js, Vite, plain JavaScript modules. No framework, no TypeScript.
- All models, textures, sounds and music are procedural. (Optional recorded sounds can be dropped into `src/assets/sounds/`.)
- **How sound is mixed** (`src/fx/audio.js`): effects and music each go through a gentle compressor, then together through a
  limiter and a soft clip, so the output can never go over full scale however much is playing. Effects are placed across the
  stereo field (near or far) and share one reverb whose character follows the level: open air (the cemetery, the hill), a cave
  (the Catacombs), a hall (the House), almost none (the Moon). A gun never makes more than 18 shot sounds a second: a faster gun
  sounds a little higher and each shot a little quieter. Small sounds (hits, kills, pickups) give way first when a lot is
  playing. `renderOffline()` plays any sound into a context that is not connected to the speakers, for measuring levels.
- **Each level has its own music**, his, made with Suno (2026-10-16 night; dl/Audio, made into loops by
  `tools/master_loops.py`: each keeps its intro, then loops between a start and an end found by matching rhythm and tone either
  side of the join, phase-aligned, the join crossfaded; all brought to one loudness; AAC in public/sounds/music): the title
  screen, DEADSLIDE (haunted drum and bass with the words); the Cemetery, high-BPM horror rock; the Catacombs, dark industrial
  techno; Free Ride on the Moon, none (his call, 2026-10-17: its track, a steady dark electro breakbeat, is still there for the
  editor's button; the level plays style 'quiet'); the House, dark electro-swing; the Long Way Down, epic hard
  rock; a boss fight, symphonic horror metal (cutting in over the Cemetery's or the Catacombs'). `src/fx/music.js` TRACKS plays
  them (the buffer's own loopStart / loopEnd) on the music's bus (its volume, the scenes holding it down); the generated
  music is still there for the casino's lounge trio, and plays any style until its recording has loaded. The menu plays the
  title theme. The editor (?editor) has a button for each, and for each story soundtrack.
- **The story has its own music** (`src/fx/score.js`): while any scene plays, the level's music is held right down; story scenes
  play one of seven quiet looping cues in its place (the cemetery, the Catacombs, the city, the House, the collapse, the launch,
  the Moon), which fades out when the scene ends and the level's music comes back.
- **The story has its own sounds** (the last section of `audio.js`, 39 of them): night wind, a far-off bell and a crow for the
  cemetery; a drone and dripping water for the Catacombs; a chip spinning in the air and ringing to a stop; an iron hatch and a
  ladder; a manhole lid, the city's hum with a distant siren, a chord as the casino is seen, wheels pushing off, the doors
  bursting; a chandelier, a riffled deck, three reels stopping; chips pouring and a marble floor cracking; a building groaning,
  glass going, the roar of the dust, three ghost voices rising; a ghost winding up and throwing (from its own side); a soft
  swell for each stretch of the hill; being buried; the hush after the last ramp; a near-silent pad, a muffled landing, a dry
  snap, a drag and a breath out, a chord for the end and a note for each credit on the Moon; a fanfare for the reward; a hit for
  each title card; a saucer's wobble on the Moon menu; and a tick each time a line of story moves on.
- A custom skating controller over a ground height function, stepped at 240 Hz; rendering runs at the display's rate.
- Hosted on Cloudflare Pages from the `main` branch (see HOSTING.md). One Pages Function (`functions/api/leaderboard.js`) stores the
  shared leaderboards (run scores, Free Ride's best lines, fastest times down the hill) in Cloudflare KV.
- Multiplayer (the casino and Free Ride) is browser to browser (PeerJS): one player hosts, the others join with a five-character code.
- Progress (gold, upgrades, cosmetics, name, best score, sound settings) is saved in the browser, under `deadslide.*`.
- Run it with `npm install` then `npm run dev`. Add `?seed=1234` to the address to revisit a world.

## Controls
The game listens for physical keys, so the letters below are for a QWERTY keyboard; the in-game help shows the letters on your own.

| Input | Action |
|---|---|
| W | Roll (steady acceleration). In the air: front flip |
| Q | Push (a burst of speed per press) |
| S | Brake, then reverse. In the air: back flip |
| A / D | Carve. In the air: spin |
| Shift | Powerslide |
| Space (hold, release) | Charge and ollie. On the pipe in level 2: let go |
| E | Trick (in the air) |
| Mouse | Look and aim. Right button aims down the sights, left button fires |
| Mouse wheel | Zoom |
| 1 to 9 | Switch gun |
| Esc | Pause (controls, sound, mouse sensitivity) |
| M / Backspace / ` | Music on or off / restart the run / tuning panel |
| F3 | Frame rate, and how much is being drawn |
| R | Free Ride: back to spawn (also a button on the pause screen). The line you were on is lost |
| B | Free Ride: off the board and on foot, and back on it. On foot: W A S D walk where the camera looks, Shift runs, Space is a moon hop, S alone backs off |
| T (hold) | Emote wheel, in Free Ride and the casino: push the mouse toward one (or press its number) and let go. Wave, cheer, smoke, dance, laugh, bow; friends see them |

## A run
- Pick a level from the menu (a nickname is required first). **Creative mode** lets you choose your starting guns, upgrades
  and power-ups, and switch monsters or damage off; it earns no gold and cannot post a score.
- **Waves** come every 30 seconds, each bigger and tougher. The **final boss** arrives at wave 7.
- Kills drop **XP gems**. Each level offers a choice of three **upgrades**. The curve climbs the whole run (5 + 4·n + 0.8·n² XP
  for the next, cap 40): about level 14 by the end of the Cemetery, 20 through the Catacombs.
- **HotBox zones** appear ahead of you: stay inside one and you **pick one of three power-ups**: ones you hold, levelled up, and
  (while you have room: four different ones at most) ones you do not. What you pick is your build.
- Monsters also drop hearts, gold coins and, rarely, chests (a gun or an item). Elites always drop a chest.
- When the boss dies, an **exit portal** opens some way off and **overtime** begins: monsters arrive faster and faster. Leave
  through the portal to bank your gold and post your score, or stay and farm at your own risk. **Die and the gold is lost.**
- Score comes from kills, tricks, grinds and style; the shared leaderboard keeps each name's best.

## Skating
- Speed is conserved: gravity speeds you up downhill and slows you uphill. Rolling tops out around 79 km/h, pushing around 122 km/h.
- Ollies charge with how long you hold. Rails can be ground, and are magnetic: come down along one within a few metres and you are drawn onto it.
  On a rail the movement keys change the grind (50-50, nosegrind, 5-0, boardslide, tailslide, noseslide, crooked, smith, feeble). Space hops:
  you stay over the rail, can trick, and land back on it. Shift steps off a rail (with Space, jumps off); off the Moon's rim rail that pushes you in toward the arena.
- Tricks, spins and flips in the air pay a speed boost on a clean landing.
- A landing is clean if the board is roughly level and pointing the way you are going; otherwise it is sloppy and costs speed.

## Level 1: the Cemetery
An endless, seeded world of rolling hills built from chunks. Each chunk is a skatepark, a graveyard or a mix: funboxes, kickers,
quarter and half pipes, bowls, rails, platforms, gaps, spines, ledges and mega ramps; grave plots ringed by leaning iron fences
you can launch off; mausoleums, monuments, the odd chapel. Scattered decor (grass, leaves, stones, bones, pumpkins, crows,
fireflies) is drawn only and cannot be run into.

- **Monsters:** zombies, skeletons (from wave 3), ghosts that fly (from wave 5).
- **Boss:** Hamzitus Goyitus, a giant bloated zombie who throws filth.

## Level 2: the Catacombs
A sewer in the dark that runs in a loop of 1,152 m: carry on round, or turn back, and you return to what you left on the floor.
You have a headlamp that points where you aim; braziers and candles are the only other light.

- **The pipe:** the tunnel is a full pipe 23 m tall. You can ride up a wall, on past vertical, across the roof and down the far side.
  You can roll and push on the walls but not on the roof; past vertical you lose speed and drop off below about 55 km/h.
- **The hub:** where you arrive. A cavern 80 m wide laid out as a skatepark, with bowls at its corners.
- **Chambers:** three smaller rooms round the loop, each with a big bowl in the middle.
- **Monsters:** giant rats (in packs of four), spiders (often on the roof; they drop on you), bone-throwers (from wave 3),
  skeletons and, late, ghosts. The rats, spiders and bone-throwers climb the walls and the roof after you.
- **Mini-boss (wave 4):** the Spider Queen. She keeps her distance and spits webs that stay on the floor, hurting and slowing you.
- **Boss:** Rubistus Goyitus, a giant made of skulls. He throws bones, and every tenth of his health a pack of skeletons falls out of him.

Level 2 is still marked as work in progress: it runs on the same timed waves as level 1, is not locked behind level 1,
and the level 1 portal does not lead to it.

## The way through, and the House
The levels are a chain: the Cemetery's portal leads to the Catacombs, and the Catacombs' to the House. Going on through a portal
banks your gold and carries everything else with you: guns, upgrades, power-ups, XP level and score. Each level can still be
started on its own from the menu.

**The House** (level 4) is the casino as an arena, and the last boss. There are no waves: Babitus Goyitus is waiting at the far end.
- **The room:** a marble floor, the roulette wheel sunk into the middle as a bowl with a brass rail round it, card tables to ride
  over, the bar down one side with a rail along it, and walls that curve up as a quarter pipe.
- **The wheel decides:** every few seconds the wheel is spun, the great chandelier turns the colour it landed on, and a moment
  later that is his attack. Red: a fan of playing cards thrown flat at you. Black: chips raining down round where you are heading.
  Zero (green, one spin in ten): cards in every direction and every slot machine pays out monsters.
- **Slot machines** in the corners pay out a pack of monsters every 10 seconds. **The barman** puts a drink on the bar every 28
  seconds: ride past for 30 health and 8 seconds of double fire rate.
- **Half health:** he speeds up, the wheel spins faster and the fans and showers get half as big again.
- He wears all his gold: chains, rings and a crown. You roll in through the front doors (they stay hanging open behind you), and the fight starts a moment later.
- **Starting there cold** (from the menu, or after dying there): you are dealt two extra guns, a power-up and eight upgrade picks.
- **Cut-ins:** "The House" when you arrive, "All in" at half health, "Bust" when he dies. Then the doors open.
- When he is dead the doors open, and they lead to the Long Way Down.

**The Long Way Down** (level 5) is the run out: three kilometres straight down the hill with the House coming down behind you.
There is nothing to fight. It can also be started from the menu.
- **The course:** three kilometres straight down, with low banks either side (nothing tall: an unseen limit at the top of them
  keeps you on the course). Four stretches: the city street down from the casino (tarmac with road markings, kerb ramps up to
  the pavements); the cemetery, through its gates (a gravel path); the storm drain (a 6 m deep half pipe with walkways and a low
  wall either side); the open hillside (a dirt track); then the last ramp.
- **What you ride past** (scenery only, none of it solid): in the city, two rows of buildings with lit windows, neon shop signs,
  street lamps, parked cars, palms and strings of lights across the street; in the cemetery, rows of crosses and slabs up both
  slopes, mausoleums, bare trees, an iron fence, candles and a chapel; along the drain, concrete ribs with green lamps, pipes,
  outfalls, and tanks, chimneys and floodlights beyond; on the hillside, pines, boulders, marker posts and a line of pylons. A
  skyline and the lights of the town below ring the whole horizon.
- **The casino** stands on the crest of the hill behind the start, with open sky behind it.
- **If the collapse catches you** a short scene plays ("Buried"): the wall over his shoulder, his face, then it going over him.
- **The collapse:** a wall of dust that starts slowly and keeps speeding up (22 m/s, gaining 0.8 a second, up to 62), and is never
  more than 110 m behind you however fast you go. If it reaches you, you are buried and the run starts again from the doors.
- **The opening scene** ("Run"): Kirky outside the casino, seen from outside for the only time (a front in the manner of Monte
  Carlo: two domed towers, three tall arched windows, a clock). The towers go, then the rest, the dust comes over where it stood,
  the three brothers rise out of it, and Kirky sets off. Plays when you come through the doors or start the level from the menu.
- **The ghosts:** all three brothers, each in his own colour: Hamzitus (green) on your left, Rubistus (blue) on your right,
  Babitus (gold) up ahead. Every 5 or 6 seconds one glows red for a second and throws at where you are about to be: Hamzitus a
  ball of filth, Rubistus two bones, Babitus a fan of three cards. A red ring on the ground shows where each will land. 15 damage
  if one lands on you while you are rolling on the ground; steer round it, or be in the air or on a rail.
- **The clock** starts when you leave the doors and stops when you leave the last ramp. Your best time is kept, and the menu shows
  the shared board of fastest times.
- **The Moon** hangs dead ahead the whole way down and gets bigger as you go.
- **The end of the hill:** over the last 350 m the banks fall away and the course becomes a tongue of ground with nothing either
  side (ride off it and the run is over), lit along both edges, ending in a 47 m ramp. Leaving its lip stops the clock and plays
  the closing scene ("Launch"): Kirky off the lip in slow motion, the Moon ahead, his face, and then away toward it.

**More story beats.** Each boss's arrival ends on one line about him (Hamzitus buries the ones who cannot pay, Rubistus wears
them, the Spider Queen was there first, Babitus's initials are on every chip; at half health, "He puts everything on the table.
Most of it was yours"). After "Bust", gold chips pour out of where Babitus stood, the floor opens and takes them, and Kirky
watches ("Nothing left to collect"). Leaving the House has its own scene: there is no portal there, the way out is the doors he burst in through, up the curve of the wall and out into the night. Dying to Babitus plays "The house wins".
On the hill a title card names each stretch as you reach it (The Cemetery, Storm Drain 7, The Hillside, The Edge), and at the
Edge the three ghosts drop back and fade.

**The editor's tabs** (with ?editor in the address, the menu's Editor button): Scenes (every cinematic), Music (each level's track and each story soundtrack), Sounds (every sound on a button, and Stop all sounds), and Models (every monster, boss, costume and gun, and a few set pieces, on a turntable: drag to turn, scroll to zoom, Spin and Animate switches, with its size and triangle count). And **DEAD AIR**: every stage of the mode on a button (`STAGES` in deadair/index.js, `mode.stage(id)` after `enter()` has finished): the entrance, the choice, the bay, everything open, rounds 3/5/8, the Warden, the Watcher, a screamer, each objective (power, signal, hold, dock, won), the BOOF (unlocked there whether or not you finished the story: `game.boofFree`), a grab, going down, the pause menu, each scare (the lamp, the vent, the breath, the doorstep, the blackout, a sleeper: scares.js has `lamp()`, `vent()`, `breath(me)`, `doorstep(.., sure)`), the lounge, the open mic, the crate and the chip.

**The cinematics editor.** With ?editor in the address the menu has a Cinematics button: a list of every scene (20), each
playable on its own. A bar across the top shows the time and has a slider to drag through it, Pause, Restart, Speed (1x, 0.5x,
0.25x, 2x), Wait on lines on/off, Next line, previous and next scene, and back to the list. Nothing done there counts.

**Story scenes can be switched off** on the pause screen ("Story scenes: off"): they are then skipped as they start. The ending and the reward still play. A boss's arrival line moves on by itself after 2.5 seconds if you do not press anything. Dying on the hill, to the ghosts as well as the dust, plays "Buried". In the House the doorway glows green once Babitus is dead.

**Runs and the menu.** The main menu has one Play button. Behind it: the Cemetery (always), each other level once you have
finished it, and Free Ride. Every player starts with only the Cemetery. At the end of a level that leads to another, two buttons:
"Go deeper" (on to the next level, carrying everything) or "End the run here" (the score can be posted, then back to the menu).
Gold is banked either way. (Adding ?all to the address lists every level, for testing.)

**The ending.** After "Launch" the game moves to the Moon and plays the last scene, "The last boof":
the Earth on its own; from high up, something falls out of the sky and hits the plain; Kirky from behind, looking up at it; his
face; his last boof, snapped in the fall; he lights it anyway and takes a long drag; the camera goes slowly round him (anyone
else up there, one for each Moon costume you have found, sits on the big ramp behind him in the distance, unremarked); then all of it from behind under the
Earth, the last two lines, the title and the credits (which include your time down the hill). About 45 seconds. Then "The End".
- **Credits:** "A game by Babitus & Clauditus."
- **The reward's reveal:** the first time you finish, before "The End", everything goes dark and the Golden BOOF (a gold broken boof) drops in out of a burst of light, turning, with sparks and its name.
- **Afterwards**, in Free Ride, the stub of the last boof lies on the Moon near where you arrive.
- **The main menu moves to the Moon** once you have finished: Kirky leans on a supply crate out on the plain with the lander behind him, his board beside him as ever, a sniper rifle in his hand that he fires now and then, and every so often a saucer crosses the sky in the distance.
- **What you get** (not in Creative mode): the Golden BOOF (a gold broken boof) (Shop, Style, "In his mouth": shown as "???" until then), put
  straight in his mouth; the title on the main menu turns gold; and the first time back at the menu the title screen plays its
  own cut-in (the boof up close, Kirky from the ground with "The house lost", then back).

**The story** is told in short scenes with a caption under them. Each line stays up until you press Enter, Space or the mouse button; Tab skips the whole scene. They are: the start of level 1 (who Kirky is up
against), the first boss's death (he was carrying a casino chip marked B.G.), arriving in level 2 (what the Catacombs are), and
the way up to the House, in two scenes: in the Catacombs, the second chip and a ladder up toward a round of street light; then out of a manhole in the city, the DeadSlide Casino lit up at the top of the hill, the skate up to it, and straight through its front doors.

## Free Ride: the Moon
The third entry in the menu is not a level but a place to skate: one fixed arena on the Moon, 500 m across, for up to four
friends at once. There is no clock, no waves and no damage. You chase the biggest **line** and the best shot.

- **Rules:** nothing hurts you, there is no levelling, no power-ups, no HotBox and no gold. Everyone carries the sniper rifle and nothing else.
- **Gravity** is about a third of normal, so everything is bigger and slower in the air.
- **On foot (B):** with all four wheels down, B kicks the board up by its tail and flicks it over onto his back (slung across it,
  nose over his right shoulder, hung from his chest bone so it moves with him: player/afoot.js). He walks (4 m/s), runs (Shift,
  6.8 m/s), hops (Space: a metre and a half on the Moon) and backs off (S alone), the way the camera looks; the camera stops
  swinging behind a heading and sits a little closer, over his shoulder. Ground he can step onto he does; a ramp's face or a wall
  stops him. He runs out a fast step-off for a few strides. Vents, the Geyser and the lava throw him on foot just as on the board.
  B again: the board drops off his back under his foot and he rolls away at the pace he was walking (3.4 m/s at least). The lift,
  R and leaving Free Ride put him straight back on it. Friends see him walking with the board on his back. A key hint sits at the
  bottom of the screen in Free Ride.
- **The map:** hills rather than flat ground, half in sunlight and half in the dark (your headlamp works there). Three channels to
  ride (a winding one, a straight rille and one that feeds the lava), craters that work as bowls, kickers and slabs, rails that chain
  into one another, a lander and a comms tower to get on top of, and a wall all the way round with a **rail along its top** that
  can be ground for the whole lap. The **Lava Pit** is a lake to jump: clear it and it pays, land in it and you are thrown out and lose your line.
  **Gas vents** throw you into the air when you cross them.
- **Lines:** a line starts with your first trick and grows with each trick, grind, big air and gap. Its worth is points times the number
  of things in it. Keep rolling for 3.2 seconds without adding anything and it is banked; land badly, fall in the lava or get shot
  and it is lost. Your best line is kept, and the menu's Free Ride leaderboard shows everyone's.
- **Riding together:** one player hosts and the others join with a five-character code (browser to browser, like the casino). You see
  each other ride, with names overhead, and a small table of everyone's best line this session.
- **Friendly fire:** shoot another rider and they are knocked off their board and lose their line; you get a hit marker and they are
  safe for 3 seconds afterwards. A **headshot** on a friend plays a kill cam.
- **Targets:** dead astronauts hop round crater rims (300) or climb out of craters and duck back (400); aliens drift over the night
  side (450); and a golden one crosses the whole arena for 25 seconds in every 90 (2,500). They follow fixed paths but react: come
  close or miss and they speed up, duck or bolt. They cannot hurt you and come back about 20 seconds after being shot. A kill adds to your line.
- **What a shot is worth:** the target's points, plus 1% per metre of distance, times 2.5 for a headshot, 1.5 in the air or 2 in the
  middle of a trick, and 1.5 without the scope.
- **Gold:** a banked line pays a little gold straight into the bank: 4 per 10,000 points, at most 20 a line.
- **Secrets:** there are costumes hidden on the Moon, each in two pieces (body and head) that can be worn together or apart. Each is won
  by finding something and doing something there, and each player has to win it personally. They show in the shop as "???" until
  found. How to get them is deliberately not written here; it is in `src/freeride/eggs.js`, behind a spoiler warning.

## Guns
You start with the pistol. Others are unlocked in the shop, then turn up in chests (the machine gun is free from the start).

| Gun | What it is |
|---|---|
| Pistol | Reliable, never runs out |
| Machine Gun | A hose of bullets, not very accurate |
| Hand Cannon | Slow, heavy rounds that go through three monsters |
| Shotgun | Ten pellets that throw the front rank back |
| Frostbite | Ice lances that pierce, chill what they hit and shatter into a freezing cloud |
| Bone Launcher | Lobs a shell that blows up a crowd |
| Sawblade Launcher | Blades that cut through everything and bounce off walls, floor and roof |
| Sniper Rifle | Scoped; one round through everything in line |
| Flamethrower | Short-range jet of fire; whatever it touches keeps burning |

## Upgrades and power-ups
- **Level-up upgrades** (`src/systems/upgrades.js`): damage, fire rate, split shot, pierce, air damage, Deck Spikes (ram monsters at speed),
  shockwave landings, a damage buff after tricks, pickup range, XP, top speed, max health, healing, a little extra safety after a hit,
  and boosters for whichever power-ups you hold.
- **Builds (the balance pass, 2026-10-16/17):** a bot that played the Cemetery (da/balance.mjs, `game.testGod`) hit the old XP
  cap of 20 at 2:40, before the boss, and stacked the gun's three cards into 9.6 times its damage against monsters 1.9 times
  tougher; the HotBox's roll and the chests' consumables built nothing. Now: the gun's cards are trimmed (Hollow Points +20% ×6,
  Rapid Fire +15% ×5, Split Shot ×2) and so are the power-ups' damage boosters (+25%, thorns and frost +30%); the deal leans to
  what you hold (a power-up's boosters come up half again as often, one of the three is always for your build if any is left);
  a HotBox is a pick of three; and **synergies** turn up once you hold their pair (pink cards, once each): Thermal Shock (Fire +
  Frost: +30% each on the other's victims), Superconductor (Lightning + Frost: +40% on the frozen, 2 more jumps), Combustion
  (Gas + Fire: +50% gas on the burning, the sick burn twice as long), Spiked Shell (Thorns + Shield: +60% and a third further
  while the shield holds), Grave Barrage (Seekers + Bone Rain: one more each, 20% faster), Open Wounds (any of Fire / Frost /
  Gas: bullets +25% on what is burning, frozen or sick); through `horde.damage`'s `kind` and `stats.combo`. Chests: the Old
  Tome three times as often, an unowned gun more often. **So that it does not get easy** (his ask), the crowd grows with you as
  well as with the wave, per level of yours above the first: +5% health, +7% to their hits, +2.5% more of them coming faster
  (`config.horde.hpPerLevel`, `damagePerLevel`, `crowdPerLevel`: at level 14, +65%, +91%, +32%); Frost Aura slows less (0.68 at
  level 2, 0.5 at most) and an elite only a little. Measured (da/power.mjs: wave 6 of the Cemetery, standing, the pistol, nothing
  but the build): the old game's stacked gun took 25.5 damage a second; a chosen Fire / Frost / Gas build at level 14 took 6.2
  before the tuning and 10.4-11.9 after; Thorns and Shield about 39; a level-20 elemental build 10.9. The gun stacked alone is
  now far harder than it was.
- **Power-ups** (`src/player/powerups.js`): Shield, TozToxik (gas cloud and trail), Ring of Fire, Grave Seekers (homing skulls), Thorns,
  Chain Lightning, Moon Rocks (lower gravity), Frost Aura, Bone Rain, Blood Pact (kills heal).
- Winning a power-up for the first time in a run pauses the game on a card explaining it, followed by a short smoking cut-in.

## Gold, shop and cosmetics
- Gold picked up in a run is worth 30% of its face value (a coin 5, an elite 25, a boss 150), and 1.75 times that in the Catacombs.
- **Permanent upgrades** (five levels each): max health, bullet damage, XP, pickup range, gold found, top speed.
- **Unlocks:** Reroll (redraw the upgrade cards once per level-up), Head Start (begin with a random power-up), Second Chance (survive one killing blow).
- **Guns:** pay once to put a gun in the chests, and again to be able to start a run holding it.
- **Style:** hoodies, beanies, deck graphics, wheels, bullet tracers, something for Kirky's mouth, and a gold finish per gun.
  Some cosmetics can only be won on the casino's slot machines.

## The casino
A Monte-Carlo style room reached from the menu, where you walk instead of skate. Up to five friends can share it.
- **Blackjack:** five seats; six decks; the dealer (Babitus Goyitus, a zombie in a dinner suit) stands on 17; blackjack pays 3 to 2;
  one split; bets from 10 to 500. Play runs from the right-hand seat to the left. Every bet is written over its chips for the whole table to read.
  F at the table (or the bar) has a smoke: a cut-in for you; the others see you do it. Smoke hangs over the table, and
  after three boofs' worth the dealer has a coughing fit and waves it away. The more the house takes, the more jewellery he wears.
- **Roulette:** one European wheel for the whole room, spun by a second Babitus. Anyone with a bet down can spin.
- **Slot machines:** 5 gold a spin, gold prizes, and three skulls wins a casino-only cosmetic.
- **The bar:** a skeleton barman mixes drinks. Three drinks make you tipsy, five make you sick and get you cut off for a while.
- **First person:** a button (or V) switches between looking over Kirky's shoulder and out of his eyes.
- Each player keeps their own gold; the host's browser runs the tables. Friends see where you are, your seat, your bets,
  your drink and the machine you are playing.

## DEAD AIR (a secret mode)
A repeatable co-op horror mode, apart from the story: up to four of you on foot, with guns, in Shackleton Station, a dark research
base outside the Moon's dome, against the dead, round after round, until the last of you goes down. The way in is a secret on the
Moon (how is deliberately not written here; it is in `src/freeride/airlock.js`, behind a spoiler warning). `?deadair` in the address
goes straight in, for testing; so does the editor's "Play DEAD AIR". It is not on the title screen.

- **The way down (v3, 2026-10-16 night):** a freight lift on the plaza behind spawn, as in his picture (freeride/airlock.js): a
  frame of dark square tube with wire mesh between, two mesh doors under a lit sign, a call panel, a caged lamp. It is sealed
  until somebody shoots the lamp (`airlock.shot`; a friend's shot arrives as `unseal()`), then the doors open. Walk in on foot and
  press E to say you are ready (`toggleReady`, the `#lift-ready` prompt counts who is in and who is ready; `ride.readies()`); once
  everyone in it is, the doors shut and `cutscenes.lift` plays, cut to his recorded cue (`moon_down`, fx/score.js `RECORDED`):
  high alongside as they walk in, behind them over the rails, the doors slamming on the cue's first hit (5.4 s), the drop (7.6),
  the shaft's red (10.2), looking up (13.4). They walk in and stand in it: the scene poses everyone on foot (`afoot.cine`).
  The post sign and the runway of lights are gone (`signAt` is kept: the line the cameras keep off).
- **The way out, on the Moon:** after the win the lift comes back up (`cutscenes.surface`, his `moon_up` cue): a look up past
  them at the shaft and the sky, the stop, and they walk out (walk clip, feet on the dust) and off to the side. Then the card
  (freeride/outcard.js: YOU GOT OUT, the round, the crew's scores best first) and, closing it, a two-shot reveal of the **Mastre of
  the Month**: a gold statue of Kirky on a plinth by the lift, with a brass plate bearing the name of whoever did worst
  (`results()` in index.js: points for kills, heads and friends got up). The round-ten trophy in the station is off; it is an
  editor stage only.
- **The landing:** the way in (story.js `entrance`, 39.3 s), cut to his cue `cue_way_in` and kept in time with it (index.js
  `runIntro` follows the cue's clock; a hitch catches up, music that came in late starts where the scene is): the cage's lamp
  coming down the shaft, inside it at the rails ("Mind the stop"), the slam on the cue's first hit (6.8 s) and the lot of you down
  in a heap, his board snapped ("...No board. Great."); up along the faces; his lighter and NINE DAYS; the PA's welcome in the
  cue's silence; then out of the lift on foot into a line, the torches clicking on one by one, a puff each in the beams, a quiet
  shot of a second drag with the smoke standing in his beam (the cue holds its breath), and DEAD AIR on the hit at 36.3. Then
  the bay is yours: nothing comes until you leave it: the first scream (`wake()`) and round 1.
- **The logs:** Jun Park's nine recorders (logs.js), one line each, the whole story: three a run of the days not found yet
  (day one by the first body in the bay until it is found), in spots from `LOG_SPOTS`; E plays the card (hud `log`: REC, the
  day, his name, the words typing), his voice (log1-9.wav, Zira at 1.06), a cut-in on the recorder then on Kirky listening,
  and a word from him (log1/3/5/7/9). Found ones persist (`deadair.logs`); the card counts them; all nine: the crew's eight
  names on the card. The ending: "Shuttle control: Deck C. How many?" / "...One." (or the count) / "They kept the days.
  Someone should know." / "Next time, we take the stairs."
- **Tonight's modifier** (nights.js, `game.night`, picked by the host in reset, on the choice card and a banner at round 1, sent
  with 'diff' and the snapshot): BLACKOUT NIGHT (dark all night, the lamp scare sooner), THE QUIET (walkers and runners only, every corpse a sleeper, lamp and breath sooner), THE
  WARDEN'S TWINS (two, every third round from the third), STEAM NIGHT (fog 0.13), THE SWARM (1.7x as many, 0.55x the gap, 0.6x
  the hp, 8 more at once). Read through `N()` in index.js at the spawn, hp, dark, warden and fog sites.
- **Her writing** (`WRITING`, `writingTexture`): NINE DAYS (the bay), WE WERE HERE, HOLD IT SHUT, DON'T OPEN MED BAY, DAY 4, TWO KEYS.
- **The way down (old):** rolling onto the open hatch on the Moon plays `cutscenes.hatch` first (7 s, it plays through, Tab skips): low
  behind him on the hatch ("Shackleton Station went quiet nine days ago"), from over it as he drops into the red ("Every channel is
  dead air"), down the steps after him ("Restore power. Send the signal. Hold out for the shuttle"), the hatch from above, smaller
  and smaller ("Dock 1 is the only way home. Everyone comes back, or nobody does"); then the station is built. In a party the host
  passes 'go' on and everyone's plays. The editor's Scenes tab has it ("Down the hatch, into DEAD AIR").
- **The story:** the crew of Shackleton Station went quiet nine days ago and every channel is dead air. A cut-in on the way in (everyone
  in the party lined up in the dark, lit by their cigarettes, Kirky's lighter that will not catch, the first scream down the Spine) says
  so, and what to do: **restore power** (prime the core in the Reactor, standing by it for 8 s), **send the signal** (start the Med Bay
  uplink and keep it alive 45 s: it draws every one of them), **hold out** three rounds for the shuttle, then **get everyone into the lift** (the cage comes back down to the bay; E at a rail, the last one in mashes F on
  the lever)
  (the airlock in the Arrival Bay's west wall) and you are out: a win, posted as one. The objective is always at the top left, with the
  distance to it, and a marker on it in the world (a diamond when it is in view, an arrow at the screen's edge pointing the way when
  it is not). The rounds never stop for any of it. `src/deadair/story.js`.
- **Look:** the crew where they fell (eight of them, blood under them and up the walls, nine days old); crates, barrels and a pillar to
  fight round in Lab 2 and the bay; dust in the air that you only see where a lamp's beam goes through it (`makeDust`: a point cloud lit
  by the beam in the shader); no two of them the same colour (five tints, each dirtied); the broken walls only where they come through.
- **On foot:** WASD walks, Shift sprints, the mouse looks. The camera is over Kirky's shoulder; hold the right button and it goes to his
  eyes, down the sights. Left fires, F is the melee (the knife or the butt: 110, knocks two of them back), R reloads, Q (or 1 / 2) swaps
  between the two guns you can carry, E buys, opens and uses. Space jumps; at a crate or a barrel it vaults over it (moving at it, floor
  on the far side) or climbs onto it, at full speed either way. H or Tab is the help card: every control and feature. Tips come up the
  first time something new is in front of you (once per browser). **Esc** (the pointer let go) is a pause menu: Resume, Controls (the help
  card), Settings (the game's own sound and mouse panel, borrowed into it), Leave (asked twice). Nothing else leaves: Esc twice does not.
  With friends the station does not wait while the menu is up.
- **Kirky on foot:** his gun arm is aimed by hand, never by a clip: up at what the crosshair is on while he aims or fires
  (and for 1.1 s after); otherwise a pistol hangs at his side (the 'idle' clip: his hands are his own) and a long gun is carried at
  low ready, both hands on it. The melee is the whole of him: 'riflemelee' played whole, at 1.6x, with a copy of his gun in the clip's
  hand (kirkyBody.js `carryInClip`: how the gun sits in his hand is measured every frame his arm is his own, and the copy is put
  there), and the hit lands 0.38 s after F, where the swing does (`MELEE.lands`). A long gun has its own clips (dl/: Rifle Run,
  Sprint Forward rifle, Rifle Start Run, Rifle Run To Stop, Rifle Aim To Down, Reload, rifle melee, Rifle Run To Dying; `CUTS` in
  walker.js says which stretch of each is played); bitten, he staggers back (the start of Fall Over); a jump is Standing Jump or
  Rifle Jump from the push-off (the game lifts him: `how.lifted` keeps the clip's own rise out of it); a vault is Vault Over Box
  (`VAULT` in walker.js: 0.62 s, the stretch 0.32–1.55 s, never the crouch behind the box at its end). Low props carry a `top`
  (station.js boxes): you stand on them, nothing low stops you once you are above it, and a vault never goes through a wall
  (`station.walled`).
- **The dead climb and vault too:** a crate in a zombie's way, it goes over (its own Vault Over Box, slower: 1.15 s, a moment it is
  easy to shoot); you up on a crate, it climbs up after you (the start of the wall climb, 1.7 s) and the claws come from level with
  you, never from the floor (`HIGH` 0.6 m). dead.js states 'vault' and 'climb'; the Warden and crawlers do neither.
- **Rounds never stall:** a zombie that has no way to you at all, or is far off (> 14 m) and has got no nearer for 12 s, comes in
  again through an opening no one can see, dropping from it (dead.js `stuck`, the 'lost' event). One in the crowd round you, or
  anywhere in anyone's sight, is never moved: that was the teleporting he saw. None is ever faster than you walk (3.9 vs 4 m/s).
- **The grab:** now and then (two in five landing swings, never twice within 14 s) one of them gets hold of you instead of swinging:
  a hard cut to the side as it slams into him (speed lines), then while it has you nobody else can hurt you (they wait their turn); its face in yours, lunging at you again and again, the view jolting
  with each lunge and reddening; THROW IT OFF: each press of F is a shove (the view thrusts, it flinches), five frees you (a cut from
  behind his shoulder as it staggers back); a friend's bullets loosen it too (two rifle rounds); else in 2.8 s it bites (45; a tight
  cut on the two heads and a white flash) and lets go. `GRAB` in `dead.js`, the cut-ins in `index.js` (`runGrabCut`).
- **Normal or Nightmare:** the host's call, before the first round (a card after the way in; the guests wait on it). Nightmare: a
  third more of them, a quarter tougher, no getting better, lights out from round 2 (every third), the Watcher more often, grabs
  more often. It unlocks once you have got out (`deadair.won` in this browser). The card and the board say which it was.
- **Screamers** (from round 4, one in fourteen): the gaunt body, yellow, slow. In sight of you it stops and calls: everything in
  earshot comes, and two more drop through the nearest walls. Not again for 14 s. 100 extra for the kill.
- **The open mic** (an easter egg): the Crew Lounge has a stage, left of the airlock: a riser with a lit lip, a red curtain, rails,
  a mic stand, three spots that are off, and a sign (OPEN MIC · EVERY NIGHT · NOBODY CAME). It stands empty. Get up on it and dance
  (T, the emote wheel) for four seconds — with friends, every one of you on your own stage at once (the stage says "n of m dancing";
  the host starts it for everyone) — and a film plays: the Warden at the mic with four of them at his sides, the spots coming on, him
  singing ("BRAAAINS"), cut like a concert film, Kirky stepping down to dance out front. The film is `public/video/deadair_openmic.mp4`
  (16.7 s, 1280x720, H.264): the live cut-in recorded from the game a frame at a time at 30 fps (the scratchpad's
  `record_openmic.mjs` takes over the page's clock so no frame is rushed or dropped) and encoded by `tools/encode_frames.py`
  (Blender's FFmpeg). The titles, the words and the speed lines are drawn over it by the HUD, in time with it; if the film cannot
  play, the cut-in plays live. After it **the band plays on**, every night, for as long as you are in there. ENCORE: 300 points.
- **The zombies' skin:** the soldier, the gaunt one, Hamzitus and Rubistus keep their own pictures (`tools/build_zombies.py`: the
  skin at 1024 and its bumps at 512, JPEG, in `public/models/zombies.glb`); a part painted on two pictures is two meshes (`head`,
  `head2`). They are drawn with them in DEAD AIR and in the main game alike (`paintedMaterial` in realMobs.js); their colours are
  still on their points for anything that draws them without (the model viewer, the stand-ins).
- **Babitus's chip:** one roll of the crate in seven is not a gun: a fat gold casino chip, G.O.Y on both faces, BABITUS round the
  edge. Taking it is 500 gold and a word from Kirky ("He signs everything.").
- **The PA's voice:** the recorded messages are spoken (Windows' own voice, Zira, band-passed and crushed into a ceiling speaker:
  `public/sounds/deadair/pa*.wav`, made by `System.Speech`), and shuttle control answers over the radio the same way. Kirky's lines
  are subtitles (ElevenLabs refused the account's free tier; his voice waits on an upgrade or a recording).
- **Shooting** is the game's own: bullets fly (streaks from the muzzle to where the crosshair is), the shotgun's and the Hand Cannon's go on
  through, the Longshot is a beam; a hit throws one back and it flinches; a kill bursts; each shot kicks the aim up, jolts the camera and
  punches the view out for an instant. Bodies are a fair target (head, chest to the neck, legs).
- **Rounds:** more of them each round (8, then 3 more and a bit each round), each taking more killing, and most of them running from the
  first round (runners from round 1, sprinters and crawlers from round 3; walkers are the few). They come **through the broken walls**,
  lit red from the other side, drop into the room and come for you; they hear shots. Only the downloaded bodies (the soldier and the gaunt
  one), never the game's own shambler. Between rounds the lights go out for a moment. Every fifth round brings **the Warden**: Hamzitus's
  body, half again as big, with a bounty of 500 and a burst of gold.
- **Loading:** a loading screen while the station is welded and the guns and bodies are loaded, and every shader is compiled with nobody
  looking (`renderer.compile` over a body of each kind, the bullets, the flash), so the first of anything mid-round is not a stall.
- **Points:** 500 to start; a hit is 10, a kill 60, through the head 100. Points open the doors (Lab 2 750, the Med Bay 1000, the Reactor
  1250) and buy the guns chalked on the walls (the MK4 rifle 1000 in the Spine, the Trench Gun 1200 in the Med Bay). The Reactor's crate
  (950) rolls you a random gun (rifle, shotgun, Hand Cannon or the Longshot .50). The pistol never runs out.
- **Reloading:** magazines come out and fall (and lie there), full ones go in, slides and pumps work, the revolver tips out its cases.
  The shotgun loads a shell at a time; firing stops it. Each gun has its own recorded sounds (CC0: `public/sounds/deadair/CREDITS.txt`).
- **Health:** 100; you get better after a few seconds without being hit. On your own, going down is the end. With friends you bleed out
  over 30 seconds unless one of them holds E over you; bled out, you are back for the next round. When everybody is down it is over.
- **Gold:** the dead sometimes drop coins (more often from a headshot); they fly to you when you are near. It is this game's gold, not the
  story's, and it is spent in the **Crew Lounge**: an airlock in the Med Bay's east wall, behind that door and 2000 points to unseal
  (a place earned, not given), through which is the casino (the same tables, the same staff, the same buttons) dressed as the station.
  Nothing follows you in; the dead wait at the airlock and you hear
  them on it. Blackjack and roulette win or lose your gold; the slots cost 5 a spin and three skulls gild the gun in your hand (+60%
  damage, half again in the magazine, gold); the bar's drinks are upgrades: Deadeye Whisky (+20% damage, 60), Quickdraw Martini
  (faster reload, steadier aim, 90), Iron Champagne (+40 health, 150). Emotes (hold T) work in there.
- **The Golden BOOF:** for whoever has finished the story. Kills charge it (25; the meter bottom left, `game.boof`); charged, G
  lights it: a 7.6 s cut-in ("Hold up. Let me hit that boof." on his face; the drag, the ember flaring; the BOOF, a cloud rolling
  out across the frame (`k.exhale(dt * 2.2, 1.9)`: big golden puffs, thinning sooner) under the word BOOF; the nearest of them, close,
  not knowing what it is looking at; GOLDEN HOUR with what it does spelled under it, "Thirty seconds. Everything dies."; the cough),
  then 30 seconds of triple damage, no ammunition used and double points, the meter counting down. Then it charges again.
- **The crate beacon:** nobody noticed the crate, so: a beam to the ceiling always on, two rings of light wobbling over it, a two-sided
  MYSTERY CRATE · 950 sign turning above it, a stronger light, a low hum from where it stands (`sound.crateHum`), and a cyan HUD
  marker on it whenever it is in view within 24 m (and not right next to you).
- **Cut-ins everywhere** (index.js `playCut`/`runCut`, run at the end of the frame so nothing overrides the camera; the world goes
  on behind them, with grace): every objective, as it begins (a reverse shot of you and whoever is near, with a word from Kirky, then
  the place itself with its title and what it wants: the camera stands on your side of it, pulled in off walls) and as it is done
  (POWER RESTORED, SIGNAL SENT, SHUTTLE DOCKED); and every scare, for a second (the lamp's stander in your face when the light comes
  back, the vent grille as it bangs and the crawler behind you as it drops, right behind your ear for the breath, the sleeper rising,
  the doorstep, LIGHTS OUT from above, IT SAW YOU snapping onto the Watcher): scares.js pushes `events`, index.js's `cutScare` plays
  them. The grab's zombie bites (zbite) the whole time it has you; going down is Fall Over, all of it, and he stays flat.
- **The open mic's cast:** the Warden sings (his Singing clip) with the mic in his right hand (dead.js keeps `handR`/`elbowR` for
  the star from the forearm part's far end; the stand's mic goes dark while he has it), the four behind him breakdance, and a dozen
  more stand in front of the stage cheering, clapping and rallying under a low cool light; the number cuts to them from behind and
  from the side.
- **More of them (the night of the 16th):** the stalker, Priya (silent, moves only while nobody is looking at it, a statue under your
  eyes, KEEP EYES ON IT the first time); one hanging from a cable in the Reactor that lets go as you pass under (from round 2);
  the knock (stand by a shut door a while: it is hammered on from the other side, the panels jolt, a crack); steam (six pipes that let
  go as you pass, a cloud, sometimes one in it); blood trails across the floor; the sleepers' round (round 6, Nightmare 4: every
  body on the floor gets up at once, THEY ARE ALL GETTING UP); the ankle (a body you step over takes your foot: held 1.1 s, 8 off);
  the crawlspace (a duct from the Spine's south wall to the Lab's north, on your belly with his crawl clips, W on and S back, no
  gun: halfway, one is coming the other way, it bites and goes over you and out); the Warden's hand (he grabs instead of clawing,
  lifts you 0.95 m off the floor, 4.4 s to the bite, 70 off, LIFT.shove 0.16: the cut-in is your boots leaving the floor).
- **Scares never go missing:** a director in scares.js makes one happen 14 s into a round and then every 20–34 s of play: the lamp
  (anywhere but the bay, when it is quiet round you), else the vent (from round 2, within 10 m of it), else the Watcher, else a
  breath behind your ear, else every light in the station stuttering with a bang not far off. The old triggers still fire on their
  own too, loosened: the lamp from round 1, sleepers from round 1, the vent from round 2, a breath on half the quiet reloads, the
  Watcher 65 % of rounds (85 % Nightmare). `scares.fired` counts them.
- **Scares:** your lamp dies and one of them is standing there when it comes back; something crawls along the vent over your head and
  drops out behind you; a breath behind your ear as you reload; one waiting on the doorstep of the lounge. None of them knock the camera.
  **The Watcher** (from round 2, now and then): one of them stood in an opening a long way off, lit red, looking at you; it does not move
  while you look at it, and a moment after you look away it is coming, screaming. **Lights out** every fourth round from the fourth: the
  strips go, the reds drop to a glow, you have your lamps. Between rounds the station's **PA** crackles with a recorded line from a crew
  that is not there (deadpan: "Please do not feed the research subjects"); the card at the end carries an epitaph ("He pressed E. It was
  not a door."). Kirky talks at each step of the story. All of it in `src/deadair/story.js`.
- **Sound:** every voice comes from where its owner is (HRTF), muffled through walls; the station hums, ticks and bangs; a drone rises
  as they close in; hurt, the world goes dull and your heart is in your ears. The guns are recordings (The Free Firearm Sound Library:
  a 1911, an AR-15, a Mossberg, a Colt 1917, a Tikka; the tail cut short on an automatic so the shots do not pile up), his boots on a
  grate are recordings (congusbongus, CC-BY), so is his breath (Owlish Media: running, scared when he is low, a gasp and a lost breath
  when he is grabbed), so is a round into meat or into metal (qubodup); their feet are heard on the plates when they are near; a thud in
  the wall as one comes through it. Three more drones come up with the moment: lights out, the broadcast, Nightmare (Joth); under
  everything a cramped-passage ambience (congusbongus). Half their groans are real recordings now (Darsycho, ianzazz; two files of many
  groans are cut into one each on load by RMS), the screamer's call and the far-off moans are qubodup's ghosts. A watchdog in
  sound.update() wakes a context the browser put to sleep and reopens a bus that fell shut; `deadAir.sound.state()` says how it
  all stands. The open mic has its own song, "DEAD AIR (Hit That Boof)" (public/sounds/deadair/show_song.ogg, 101 s, made with
  Suno: hard rock, a zombie growl, about the mastre and his boof): it starts with the show, straight onto the bus (the lounge's
  muffling is for the station, not the room), the cut-in's lyric cards are its first lines, the crowd roars as the band comes on and
  cheers at the finish (`sound.crowd`), and after the cut-in it plays on at half level until you leave (`sound.song` handle). Every
  recording and its licence is in `public/sounds/deadair/CREDITS.txt`.
  **His music** (2026-10-16 night; made with Suno, in dl/Audio; cut, faded and levelled by `tools/master_audio.py` into
  public/sounds/deadair/music/*.aac and public/sounds/music/cue_moon_*.aac; Suno's mp4/webm are decoded in the browser and
  encoded with WebCodecs' AAC, since Blender's FFmpeg reads neither): `sound.music` in sound.js plays the loops **dread**
  (before they wake, between rounds), **hunt** (a round), **swarm** (five or more within 11 m, or holding a door, a
  decompression, a grab; it drops back to the hunt only after 9 s calm) and **lounge** (in the Crew Lounge, in place of the
  casino's own music; silent while the band plays), each starting somewhere in itself and crossfading (4 s) into the next and
  into its own start; the cues of the way in and the way out (each scene follows the cue's clock: `music.cue()` returns it);
  a child's music-box **jingle** for each objective done (power, signal, the lift down); **stingers** with the bang of one coming
  through a grille near you (`spawnNoise`: at most one stinger in 9 s); now and then, in the quiet, one of them **laughing**
  somewhere off in the dark (through the walls if that is where it is); the loops duck under the PA and the tapes. index.js
  `runMusic` picks the loop. `deadAir.music` says what is playing and keeps a log of the last events (the tests).
  **The mix:** less reverb (a 1.5 s steel tail, its return at 0.28), more of the sounds themselves: their groans and screams
  louder, drier and heard further (ref 4.5 m), more often while they chase; their feet are recorded steps slowed and dulled,
  with a dragged foot for the walkers, heard within 22 m; his own steps drier, with his kit's clink and his jacket's rub.
  **The dread** (sound.js): the station's bed is the mains hum with its harmonics (heard on any speaker), the air handlers
  breathing, a hiss and a sub-bass rumble under it all; a chord that is wrong (root, minor second, tritone), filtered, swells and
  brightens as they close in, with strings scraping high over it when they are on you; one of them is heard far off through the
  walls every few seconds (a moan, a scream, something hammering a door), more often the closer the rest are; something heavy
  crosses the ceiling over you now and then; one close behind you that you have not looked at breathes, wet, right there; and
  half the time a round ends in dead air — everything drops away — and then a scream or a bang. The calm bed sits about -22 dB,
  the station with five of them behind you about -9 dB (measured at the effects bus).
- **Detail:** within 16 m of the camera up to twelve of each body are drawn in full detail (the sculpted parts); beyond, or past that,
  the plainer stand-in. The band in the lounge is always full detail.
- **Friends:** a Moon party (Free Ride's code) goes down together. The host's browser runs the dead and the rounds; everyone else
  draws them and asks the host for what they do. If the host leaves, whoever is left carries on alone with what was there.
- **Score:** the round you reached is kept (your best in this browser), and posted to the `deadair` leaderboard board on the published site.
  With friends the card lists the crew: each one's kills, headshots and friends got up, and an MVP.
- **Where:** `src/deadair/` (station, walker, dead, arms, reload, coins, lounge, party, scares, crate, sound, hud, index),
  `src/freeride/airlock.js`, `tools/build_deadair_kit.py` (the station's kit: Quaternius's Modular Sci-Fi MegaKit, CC0),
  `tools/build_deadair_audio.py`.

### The station: one floor (2026-10-16 night)
The Observation Deck, its stairs and parapets are gone, at his word: `MAP` (station.js, 24x13 cells of 4 m) is one floor
again, ceilings back to the original height, `STAIRS = []`. The level machinery (`levelAt`, `ceilAt`, `linked`) stays and
returns the one floor. The Spine's north branch stops short of the Med Bay (its last cell was a way round the Med Bay's door).
`SPAWNS` (28 holes, each with its red gash over it) is in again; the Arrival Bay's five open only once the station is awake.
The bay's corner crates stand off the west wall as one block: offset, they made a pocket in front of the (1,1) hole that a
zombie could not get out of (found by the bot soak). And one that means to move and has not for 1.6 s steps aside along
whatever it is against (dead.js `aside`), so nothing stays wedged.

### Co-op mechanics, the skit, the chicken
All ten co-op mechanics live in index.js (hold it shut, decompression, strap in, carry the downed, revive together, the crank
for the uplink `CRANK`, keep eyes on it, the dead-man safe `SAFE`, back to back, the core's two hands) with editor stages under
Co-op: the two keys are terminals at opposite ends of the station (KEY A in the Arrival Bay, KEY B in Lab 2 by the Reactor door) that
have to be turned within a window of each other (3 s with friends, 14 s alone) to open the Reactor's door (it cannot be bought);
the crank is turned by moving the mouse in circles. The reload skit: one magazine reload in twenty-five with one of the dead in sight, `maybeFumble` → a five-shot cut-in
(reload.js `hold/resume`, dead.js state 'skit'). The rubber chicken (`public/models/chicken.glb`, his) lies on the table in the bunk room (`buildTable`);
taken, it rides the gun's muzzle (`mountChicken`) and F squeaks (arms `chicken`). `tools/sync_lyrics.py` times the open mic's
lyric cards to the song with faster-whisper. The laughs: Porro trop chargé (one Golden BOOF in ten: a coughing fit until one of
them smacks him on the back), the conga (dance a few seconds with the dead about: they line up behind you breakdancing, as at the open
mic), the Mastre of the Month (now a statue on the Moon, after a win). Cheap scares by place (scares.js
`placeFire`): steps overhead (on the roof), the bunk, the one sitting against the Med Bay wall, the drip from the ceiling, the footlocker's lid, the
wheel turning by itself, the missing body, the recorder playing by itself (`scares.logs` is handed in by index.js). The lounge's shaders are
compiled in `prepare()` (`warm()`), so the show's first frame no longer stalls.

## House style
- **Cut-ins** (boss and mini-boss arrivals, the boss's death, the portal, casino moments, Free Ride's kill cam and found costumes) follow one style: several hard cuts,
  snap zooms, close-ups, white flashes, speed lines, a beat of slow motion and a big title.
- **Look:** a gloomy, fairly realistic night-time cemetery; landings are forgiving; the focus is shooting monsters.
- **Code:** small readable files, comments that explain why, tunables in `src/config.js`. Each content list (weapons, upgrades,
  power-ups, monsters, cosmetics, level features) is a data table with a comment at the top saying how to add to it.

## Where things are
```
src/
  main.js            the loop, a run's state, wiring everything together
  config.js          every tunable number
  input.js           keys and mouse
  cutscenes.js       boss, mini-boss, portal and exit scenes, the kill cam, a costume found
  player/            skater.js (physics, the pipe), skaterModel.js, chaseCamera.js, weapon(s).js, gunModels.js,
                     powerups.js, tricks.js, stats.js, costumes.js, emotes.js
  enemies/           types.js (the monsters' numbers), enemyModels.js, horde.js (spawning, moving, climbing, bosses)
  world/             level.js, terrain.js (the one place that answers "what is the ground here?"),
                     worldgen.js + noise.js (the Cemetery), catacombs.js (level 2), moon.js (Free Ride), features.js, chunkMesh.js, arena.js
  freeride/          ride.js (riding together), targets.js (astronauts and aliens), eggs.js (the secrets: spoilers), airlock.js (the way to DEAD AIR: spoilers)
  deadair/           DEAD AIR: index.js (the rules, rounds, the party), station.js, walker.js, dead.js, arms.js, reload.js, lounge.js, scares.js, ...
  systems/           xp, upgrades, loot, gold, hotbox, portal, score, lines (Free Ride's scoring), profile (what you own), cosmetics, storage
  casino/            casino.js (the controller and the connection), room.js (the 3D room), blackjack.js, roulette.js,
                     slots.js, bar.js, net.js
  menu/              menu.js, menuScene.js, shop.js
  ui/                hud, levelUp, leaderboard, goldTally, playerName, audioControls, keys (key names for your keyboard), tweakPanel
  fx/                audio.js (every sound), music.js
functions/api/       leaderboard.js
```

## Known gaps
- Level 2 has no goal of its own yet, and is not tied to level 1 (see above).
- Levels 1 and 2 are single-player; only the casino and Free Ride are shared.
- Free Ride has not yet been played by two people on two computers: riding together, friendly fire and the kill cam have only
  been tested with two tabs on one machine. Frame rate with four riders is estimated, not measured.
- Most recent additions have been checked by script and screenshot more than by play, so balance is unsettled.
- DEAD AIR (2026-10-16): everything from the overnight build has been verified headless (stills, two browsers on one machine)
  and not yet by a person; the open mic's cards are timed by faster-whisper (small + medium; the growled lines are the least certain);
  the recorder scare is each browser's own; the ten co-op mechanics that need four players (the core's two hands) have only
  been reasoned through, not run with four.
