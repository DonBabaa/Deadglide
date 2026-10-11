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
- A custom skating controller over a ground height function, stepped at 240 Hz; rendering runs at the display's rate.
- Hosted on Netlify from the `main` branch. One Netlify Function (`netlify/functions/leaderboard.mjs`) stores the shared leaderboards
  (run scores, and Free Ride's best lines).
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
| T (hold) | Emote wheel, in Free Ride and the casino: push the mouse toward one (or press its number) and let go. Wave, cheer, smoke, dance, laugh, bow; friends see them |

## A run
- Pick a level from the menu (a nickname is required first). **Creative mode** lets you choose your starting guns, upgrades
  and power-ups, and switch monsters or damage off; it earns no gold and cannot post a score.
- **Waves** come every 30 seconds, each bigger and tougher. The **final boss** arrives at wave 7.
- Kills drop **XP gems**. Each level (cap 20) offers a choice of three **upgrades**.
- **HotBox zones** appear ahead of you: stay inside one to win a **power-up** (you can hold four different ones; after that zones level up the ones you have).
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

**The cinematics editor.** With ?editor in the address the menu has a Cinematics button: a list of every scene (20), each
playable on its own. A bar across the top shows the time and has a slider to drag through it, Pause, Restart, Speed (1x, 0.5x,
0.25x, 2x), Wait on lines on/off, Next line, previous and next scene, and back to the list. Nothing done there counts.

**Story scenes can be switched off** on the pause screen ("Story scenes: off"): they are then skipped as they start. The ending and the reward still play. A boss's arrival line moves on by itself after 2.5 seconds if you do not press anything. Dying on the hill, to the ghosts as well as the dust, plays "Buried". In the House the doorway glows green once Babitus is dead.

**Runs and the menu.** The main menu has one Play button. Behind it: the Cemetery (always), each other level once you have
finished it, and Free Ride. Every player starts with only the Cemetery. At the end of a level that leads to another, two buttons:
"Go deeper" (on to the next level, carrying everything) or "End the run here" (the score can be posted, then back to the menu).
Gold is banked either way. (Adding ?all to the address lists every level, for testing.)

**The ending.** After "Launch" the game moves to the Moon and plays the last scene, "The last cigarette":
the Earth on its own; from high up, something falls out of the sky and hits the plain; Kirky from behind, looking up at it; his
face; his last cigarette, snapped in the fall; he lights it anyway and takes a long drag; the camera goes slowly round him (anyone
else up there, one for each Moon costume you have found, sits on the big ramp behind him in the distance, unremarked); then all of it from behind under the
Earth, the last two lines, the title and the credits (which include your time down the hill). About 45 seconds. Then "The End".
- **Credits:** "A game by Babitus & Clauditus."
- **The reward's reveal:** the first time you finish, before "The End", everything goes dark and the gold broken cigarette drops in out of a burst of light, turning, with sparks and its name.
- **Afterwards**, in Free Ride, the stub of the last cigarette lies on the Moon near where you arrive.
- **The main menu moves to the Moon** once you have finished: Kirky leans on a supply crate out on the plain with the lander behind him, his board beside him as ever, a sniper rifle in his hand that he fires now and then, and every so often a saucer crosses the sky in the distance.
- **What you get** (not in Creative mode): the gold broken cigarette (Shop, Style, "In his mouth": shown as "???" until then), put
  straight in his mouth; the title on the main menu turns gold; and the first time back at the menu the title screen plays its
  own cut-in (the cigarette up close, Kirky from the ground with "The house lost", then back).

**The story** is told in short scenes with a caption under them. Each line stays up until you press Enter, Space or the mouse button; Tab skips the whole scene. They are: the start of level 1 (who Kirky is up
against), the first boss's death (he was carrying a casino chip marked B.G.), arriving in level 2 (what the Catacombs are), and
the way up to the House, in two scenes: in the Catacombs, the second chip and a ladder up toward a round of street light; then out of a manhole in the city, the DeadSlide Casino lit up at the top of the hill, the skate up to it, and straight through its front doors.

## Free Ride: the Moon
The third entry in the menu is not a level but a place to skate: one fixed arena on the Moon, 500 m across, for up to four
friends at once. There is no clock, no waves and no damage. You chase the biggest **line** and the best shot.

- **Rules:** nothing hurts you, there is no levelling, no power-ups, no HotBox and no gold. Everyone carries the sniper rifle and nothing else.
- **Gravity** is about a third of normal, so everything is bigger and slower in the air.
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
  after three cigarettes' worth the dealer has a coughing fit and waves it away. The more the house takes, the more jewellery he wears.
- **Roulette:** one European wheel for the whole room, spun by a second Babitus. Anyone with a bet down can spin.
- **Slot machines:** 5 gold a spin, gold prizes, and three skulls wins a casino-only cosmetic.
- **The bar:** a skeleton barman mixes drinks. Three drinks make you tipsy, five make you sick and get you cut off for a while.
- **First person:** a button (or V) switches between looking over Kirky's shoulder and out of his eyes.
- Each player keeps their own gold; the host's browser runs the tables. Friends see where you are, your seat, your bets,
  your drink and the machine you are playing.

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
  freeride/          ride.js (riding together), targets.js (astronauts and aliens), eggs.js (the secrets: spoilers)
  systems/           xp, upgrades, loot, gold, hotbox, portal, score, lines (Free Ride's scoring), profile (what you own), cosmetics, storage
  casino/            casino.js (the controller and the connection), room.js (the 3D room), blackjack.js, roulette.js,
                     slots.js, bar.js, net.js
  menu/              menu.js, menuScene.js, shop.js
  ui/                hud, levelUp, leaderboard, goldTally, playerName, audioControls, keys (key names for your keyboard), tweakPanel
  fx/                audio.js (every sound), music.js
netlify/functions/   leaderboard.mjs
```

## Known gaps
- Level 2 has no goal of its own yet, and is not tied to level 1 (see above).
- Levels 1 and 2 are single-player; only the casino and Free Ride are shared.
- Free Ride has not yet been played by two people on two computers: riding together, friendly fire and the kill cam have only
  been tested with two tabs on one machine. Frame rate with four riders is estimated, not measured.
- Most recent additions have been checked by script and screenshot more than by play, so balance is unsettled.
