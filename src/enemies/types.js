// Enemy stats. Add a monster by adding an entry here and a model with the
// same name in enemyModels.js, then mention it in horde.js's pickType().
//   speed in m/s, radius/height in metres, damage in hearts.

export const ENEMY_TYPES = {
  // Zombie: slow, tanky, comes in crowds.
  shambler: { speed: 5.5, hp: 30, radius: 0.5, height: 1.8, damage: 1, score: 10, sway: 0.14 },
  // Skeleton: fast and fragile.
  rattler: { speed: 11, hp: 10, radius: 0.4, height: 1.8, damage: 1, score: 15, sway: 0.07 },
};
