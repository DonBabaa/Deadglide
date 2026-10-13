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
  // ---- Level 2 (the Catacombs) has monsters of its own. They all climb: wherever you go on the pipe,
  // up its walls or across its roof, they come after you. (How they move is climb() in horde.js.)
  //   climbs = true; pack = how many come up together; drops = lets go of the roof to land on you;
  //   throws = { every: seconds between throws, range: from how far, keep: the distance it tries to hold,
  //              damage: a direct hit, splash: caught near it, radius: how near }.
  // Rat: a giant one. Weak, fast, and never alone.
  rat: { speed: 12.5, hp: 7, radius: 0.42, height: 0.55, damage: 4, score: 8, xp: 1, sway: 0, stride: 2.4, climbs: true, pack: 4 },
  // Spider (a big one). Often comes along the roof, and drops on you from it.
  crawler: { speed: 8.5, hp: 28, radius: 0.6, height: 0.8, damage: 10, score: 18, xp: 2, sway: 0, stride: 1.5, climbs: true, drops: true },
  // Bone-thrower: hangs back and lobs bones at you. Standing still near one is a bad idea.
  thrower: { speed: 4.5, hp: 44, radius: 0.5, height: 1.9, damage: 8, score: 30, xp: 4, sway: 0, stride: 0.9, climbs: true, throws: { every: 3.4, range: 46, keep: 20, damage: 9, splash: 4, radius: 2 } },

  // The Spider Queen: level 2's mini-boss (wave config.horde.miniWave; her health is config.horde.miniHp).
  // She keeps her distance and spits webs. A web that lands stays on the floor: touch it and it hurts and slows you.
  //   webs = { every: seconds between spits, range, keep: the distance she holds, hit: a web landing on you,
  //            life: seconds a web lasts, radius: its size, damage: per touch, drag: how hard it slows you,
  //            crawl: the speed (m/s) it won't slow you below }.
  queen: {
    title: 'Spider Queen', miniboss: true, scale: 4.2, speed: 7, hp: 1, radius: 0.7, height: 0.85, damage: 18, score: 400, xp: 30, sway: 0, stride: 1.2, climbs: true,
    webs: { every: 2.4, range: 60, keep: 16, hit: 8, life: 12, radius: 3.4, damage: 5, drag: 1.8, crawl: 5 },
  },

  // Level 2's boss: a giant built out of skulls. Every tenth of his health you knock off him, a pack of
  // skeletons falls out of him and he gets a little smaller. He throws bones (bones: true), not filth.
  //   hpScale = his health as a multiple of config.horde.bossHp; shed = what falls out of him, and how often
  //   (as a fraction of his health); blob / splat = the colour of what he throws and the mark it leaves;
  //   cutIn = which arrival scene he gets (see cutscenes.js).
  boss2: {
    title: 'Rubistus Goyitus', boss: true, scale: 3.4, speed: 5, hp: 1, hpScale: 1.3, radius: 0.62, height: 2.2, damage: 30, score: 1500, xp: 80, sway: 0.08, stride: 0.5,
    shed: { every: 0.1, type: 'rattler', count: 5, shrink: 0.3 }, bones: true, blob: 0xd8d2bf, splat: 0x24201a, cutIn: 'skulls',
  },
  // The last boss, in the House (level 4). He doesn't throw filth: the roulette wheel decides what he does (see horde.js).
  boss3: {
    title: 'Babitus Goyitus', boss: true, house: true, scale: 3.2, speed: 10.5, hp: 1, hpScale: 2.6, radius: 0.55, height: 2.0, damage: 30, score: 3000, xp: 0, sway: 0.02, stride: 0.36,
    blob: 0xf3efe4, splat: 0x1a1a1a, cutIn: 'house',
  },
  boss: { title: 'Hamzitus Goyitus', boss: true, scale: 5.5, speed: 4.5, hp: 1, radius: 0.72, height: 1.95, damage: 30, score: 1000, xp: 60, sway: 0.1, stride: 0.5 },
};
// (Babitus again, wearing more of your gold each time: see `babitus` in enemyModels.js.)
// The hill's boss (systems/descent.js draws him: the horde never spawns him).
ENEMY_TYPES.ultimus = { title: 'Goyitus Ultimus', boss: true, scale: 5, speed: 0, hp: 1, radius: 0.7, height: 2.7, damage: 0, score: 0, xp: 0, sway: 0, stride: 0.5 };
for (const more of ['b', 'c', 'd']) ENEMY_TYPES[`boss3${more}`] = ENEMY_TYPES.boss3;
// More zombies: the same monster in another body (a soldier in what is left of his uniform; a gaunt one, bare to the
// waist). Whenever a zombie is spawned it is one of these, picked at random (see Horde.spawnAt, and
// public/models/zombies.glb, made by tools/build_zombies.py).
export const ZOMBIES = ['shambler', 'zombieb', 'zombiec'];
for (const name of ZOMBIES.slice(1)) ENEMY_TYPES[name] = ENEMY_TYPES.shambler;
