// Enemy stats. Add a monster by adding an entry here and a model with the
// same name in enemyModels.js, then mention it in horde.js's pickType().
//   speed in m/s, radius/height in metres, damage in HP per hit (you have 100), xp = gem value.
//   stride = how fast the limbs swing for the speed it moves; sway = side-to-side lurch.
//   emissive / opacity = a glow colour and see-through-ness for the whole model.

export const ENEMY_TYPES = {
  // Zombie: slow, tanky, hits hard, comes in crowds.
  shambler: { speed: 5.5, hp: 30, radius: 0.5, height: 1.8, damage: 10, score: 10, xp: 1, sway: 0.14, stride: 1.1 },
  // Skeleton: fast and fragile, with a light hit.
  rattler: { speed: 11, hp: 10, radius: 0.4, height: 1.8, damage: 6, score: 15, xp: 2, sway: 0.05, stride: 1.0 },
  // Ghost: flies, ignores obstacles, and follows you up into the air.
  wraith: { speed: 15, hp: 15, radius: 0.5, height: 1.5, damage: 8, score: 20, xp: 3, sway: 0.1, stride: 0.25, flying: true, climb: 11, emissive: 0x1b2a40, opacity: 0.9 },
  // The final boss: a giant fat zombie who throws filth. Only ever one of him (see horde.js);
  // his health is config.horde.bossHp. `scale` is how many times bigger than a normal monster he is.
  // Level 2's boss: a giant built out of skulls. Every tenth of his health you knock off him, a pack of
  // skeletons falls out of him and he gets a little smaller. He throws skulls.
  //   hpScale = his health as a multiple of config.horde.bossHp; shed = what falls out of him, and how often
  //   (as a fraction of his health); blob / splat = the colour of what he throws and the mark it leaves;
  //   cutIn = which arrival scene he gets (see cutscenes.js).
  boss2: {
    title: 'Paulitus Goyitus', boss: true, scale: 3.4, speed: 5, hp: 1, hpScale: 1.3, radius: 0.62, height: 2.2, damage: 30, score: 1500, xp: 80, sway: 0.08, stride: 0.5,
    shed: { every: 0.1, type: 'rattler', count: 5, shrink: 0.3 }, blob: 0xd8d2bf, splat: 0x24201a, cutIn: 'skulls',
  },
  boss: { title: 'Hamzitus Goyitus', boss: true, scale: 5.5, speed: 4.5, hp: 1, radius: 0.72, height: 1.95, damage: 30, score: 1000, xp: 60, sway: 0.1, stride: 0.5 },
};
