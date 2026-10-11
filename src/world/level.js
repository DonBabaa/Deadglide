// Which world is being built. 1 = the Cemetery (worldgen.js), 2 = the Catacombs (catacombs.js),
// 3 = the Moon (moon.js), which is Free Ride: no damage, no levelling, sniper only, and a low gravity.
// 4 = the House (house.js): the casino, and the last boss. 5 = the Long Way Down (descent.js): the run out.
// Change it with setLevel() in terrain.js, which also throws away the chunks already made.
export const world = { level: 1 };

//   gravity   a multiple of normal gravity (1 if not given)
//   freeRide  true: the Free Ride rules (see main.js)
//   next      the level its exit portal leads to (none: back to the menu)
//   finale    true: no waves, the boss is waiting for you; a fresh start here is dealt a hand of upgrades
//   descent   true: the run out (no monsters, no shooting to do: outrun the collapse; see systems/descent.js)
//   locked    true: only on the menu once you have reached it (see profile.reached)
export const LEVELS = {
  1: { name: 'Level 1', tagline: 'The Cemetery \u00b7 endless waves', next: 2 },
  2: { name: 'Level 2', tagline: 'The Catacombs \u00b7 in the dark', next: 4 },
  3: { name: 'Free Ride', tagline: 'The Moon \u00b7 no damage, low gravity, sniper only', gravity: 0.34, freeRide: true },
  4: { name: 'The House', tagline: 'The casino \u00b7 the house always wins', finale: true, next: 5 },
  5: { name: 'The Long Way Down', tagline: 'Out the doors and down the hill \u00b7 do not stop', descent: true },
};
