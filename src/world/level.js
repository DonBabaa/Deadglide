// Which level the world is being built for. 1 = the Cemetery (worldgen.js), 2 = the Catacombs (catacombs.js).
// Change it with setLevel() in terrain.js, which also throws away the chunks already made.
export const world = { level: 1 };

export const LEVELS = {
  1: { name: 'Level 1', tagline: 'The Cemetery · endless waves' },
  2: { name: 'Level 2', tagline: 'The Catacombs · in the dark' },
};
