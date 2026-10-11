// Which world is being built. 1 = the Cemetery (worldgen.js), 2 = the Catacombs (catacombs.js),
// 3 = the Moon (moon.js), which is Free Ride: no damage, no levelling, sniper only, and a low gravity.
// Change it with setLevel() in terrain.js, which also throws away the chunks already made.
export const world = { level: 1 };

//   gravity   a multiple of normal gravity (1 if not given)
//   freeRide  true: the Free Ride rules (see main.js)
export const LEVELS = {
  1: { name: 'Level 1', tagline: 'The Cemetery \u00b7 endless waves' },
  2: { name: 'Level 2', tagline: 'The Catacombs \u00b7 in the dark' },
  3: { name: 'Free Ride', tagline: 'The Moon \u00b7 no damage, low gravity, sniper only', gravity: 0.34, freeRide: true },
};
