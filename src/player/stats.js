// Everything upgrades can change about the player. One shared object:
// upgrades write to it, the gun / skater / horde read from it.

const BASE = {
  damage: 1,          // gun damage multiplier
  fireRate: 1,        // fire rate multiplier
  projectiles: 1,     // bullets per shot
  pierce: 0,          // extra monsters a bullet passes through
  airDamage: 1,       // damage multiplier while airborne
  ramDamage: 0,       // damage dealt by riding into monsters at speed (0 = you get hurt instead)
  pickupRadius: 1,    // XP pickup radius multiplier
  xpGain: 1,          // XP multiplier
  goldGain: 1,        // gold multiplier
  topSpeed: 1,        // push top-speed multiplier
  maxHp: 0,           // extra HP on top of config.player.maxHp
  invulnerable: 0,    // extra seconds of safety after a hit
  trickBuff: 0,       // seconds of double damage after landing a trick
  shockwave: 0,       // damage of the ring released when you land a trick (0 = none)
  frenzy: 0,          // seconds of double fire rate left (from the Energy Drink chest item)
  gravity: 1,         // gravity multiplier (Moon Rocks lowers it)
  xpLevel: 1,         // the level you are at (main.js keeps it: the crowd grows with you, config.horde.hpPerLevel)
  shieldUp: 0,        // 1 while the HotBox shield holds (powerups.js keeps it: Spiked Shell)
};

// HotBox power-ups (see player/powerups.js). For each one:
//   level = how many times you've won it (0 = don't have it)
//   damage / size / rate = multipliers from level-up upgrades; count = extra orbs, skulls or jumps
export const POWER_IDS = ['shield', 'gas', 'fire', 'seekers', 'thorns', 'lightning', 'float', 'frost', 'rain', 'pact'];
const freshPowers = () => Object.fromEntries(POWER_IDS.map((id) => [id, { level: 0, damage: 1, size: 1, rate: 1, count: 0 }]));

// combo: the synergies taken (systems/upgrades.js: thermal, conductor, combust, spiked, barrage, wounds)
export const stats = { ...BASE, taken: {}, power: freshPowers(), combo: {} };   // taken: upgrade id -> how many times picked

export function resetStats() {
  Object.assign(stats, BASE);
  stats.taken = {};
  stats.power = freshPowers();
  stats.combo = {};
}
