// The upgrade pool. Each level-up offers three of these at random.
// Add an upgrade by adding an entry:
//   rarity: 'common' | 'rare'   (rare ones turn up about a third as often)
//   max:    how many times it can be taken
//   apply(stats, run): change the player's stats (see player/stats.js);
//                      `run` has heal(n) for upgrades that restore hearts.
import { stats } from '../player/stats.js';

export const UPGRADES = [
  { id: 'damage', name: 'Hollow Points', description: '+25% bullet damage.', rarity: 'common', max: 8, apply: (s) => { s.damage += 0.25; } },
  { id: 'fireRate', name: 'Rapid Fire', description: '+20% fire rate.', rarity: 'common', max: 6, apply: (s) => { s.fireRate += 0.2; } },
  { id: 'split', name: 'Split Shot', description: '+1 bullet per shot, fanned out.', rarity: 'rare', max: 4, apply: (s) => { s.projectiles += 1; } },
  { id: 'pierce', name: 'Grindstone', description: 'Bullets pass through one more monster.', rarity: 'common', max: 4, apply: (s) => { s.pierce += 1; } },
  { id: 'air', name: 'Air Superiority', description: '+50% damage while you are in the air.', rarity: 'common', max: 4, apply: (s) => { s.airDamage += 0.5; } },
  { id: 'spikes', name: 'Deck Spikes', description: 'Riding into monsters at over 60 km/h hurts them instead of you.', rarity: 'rare', max: 4, apply: (s) => { s.ramDamage += 40; } },
  { id: 'shockwave', name: 'Shockwave Landing', description: 'Landing a trick releases a ring that damages everything nearby.', rarity: 'rare', max: 4, apply: (s) => { s.shockwave += 40; } },
  { id: 'style', name: 'Style Points', description: 'Landing a trick doubles your damage for 3 more seconds.', rarity: 'common', max: 3, apply: (s) => { s.trickBuff += 3; } },
  { id: 'magnet', name: 'Bone Magnet', description: '+50% XP pickup range.', rarity: 'common', max: 4, apply: (s) => { s.pickupRadius += 0.5; } },
  { id: 'xp', name: 'Quick Learner', description: '+20% XP from everything.', rarity: 'common', max: 5, apply: (s) => { s.xpGain += 0.2; } },
  { id: 'speed', name: 'Hot Wheels', description: '+10% top pushing speed.', rarity: 'common', max: 5, apply: (s) => { s.topSpeed += 0.1; } },
  { id: 'heart', name: 'Second Wind', description: '+1 maximum heart, and heal one.', rarity: 'rare', max: 5, apply: (s, run) => { s.maxHearts += 1; run.heal(1); } },
  { id: 'heal', name: 'Patch Up', description: 'Heal two hearts.', rarity: 'common', max: 99, apply: (s, run) => run.heal(2) },
  { id: 'skin', name: 'Thick Skin', description: '+0.5 s of safety after taking a hit.', rarity: 'common', max: 3, apply: (s) => { s.invulnerable += 0.5; } },
];

// Up to `count` different upgrades that can still be taken.
export function rollUpgrades(count = 3) {
  const pool = UPGRADES.filter((u) => (stats.taken[u.id] || 0) < u.max);
  const picks = [];
  while (picks.length < count && pool.length) {
    const weights = pool.map((u) => (u.rarity === 'rare' ? 1 : 3));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), i = 0;
    while ((r -= weights[i]) > 0) i++;
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks;
}

export function takeUpgrade(upgrade, run) {
  stats.taken[upgrade.id] = (stats.taken[upgrade.id] || 0) + 1;
  upgrade.apply(stats, run);
}
