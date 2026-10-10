// Enemy stats. Add a monster by adding an entry here and a model with the
// same name in enemyModels.js, then mention it in horde.js's pickType().
//   speed in m/s, radius/height in metres, damage in HP per hit (you have 100), xp = gem value.

export const ENEMY_TYPES = {
  // Zombie: slow, tanky, hits hard, comes in crowds.
  shambler: { speed: 5.5, hp: 30, radius: 0.5, height: 1.8, damage: 10, score: 10, xp: 1, sway: 0.14 },
  // Skeleton: fast and fragile, with a light hit.
  rattler: { speed: 11, hp: 10, radius: 0.4, height: 1.8, damage: 6, score: 15, xp: 2, sway: 0.07 },
  // Ghost: flies, ignores obstacles, and follows you up into the air. From wave 3.
  wraith: { speed: 15, hp: 15, radius: 0.5, height: 1.5, damage: 8, score: 20, xp: 3, sway: 0.1, flying: true, climb: 11, emissive: 0x1c2a3c },
};
