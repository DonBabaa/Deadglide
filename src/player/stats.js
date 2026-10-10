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
  topSpeed: 1,        // push top-speed multiplier
  maxHp: 0,           // extra HP on top of config.player.maxHp
  invulnerable: 0,    // extra seconds of safety after a hit
  trickBuff: 0,       // seconds of double damage after landing a trick
  shockwave: 0,       // damage of the ring released when you land a trick (0 = none)
  frenzy: 0,          // seconds of double fire rate left (from the Energy Drink chest item)
};

export const stats = { ...BASE, taken: {} };   // taken: upgrade id -> how many times picked

export function resetStats() {
  Object.assign(stats, BASE);
  stats.taken = {};
}
