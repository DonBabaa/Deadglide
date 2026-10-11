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
