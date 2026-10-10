// The guns. You start with the pistol; the rest come out of loot chests.
// Add a weapon by adding an entry (it is then also added to the chest loot).
//   damage      per bullet (headshots multiply it)
//   fireRate    shots per second while the button is held
//   pellets     bullets per shot
//   spreadHip / spreadAim   scatter in degrees, firing from the hip / aiming
//   speed, life bullet speed (m/s) and how many seconds it flies
//   pierce      extra monsters each bullet passes through
//   gravity     how fast the bullet drops (0 = flies straight)
//   blast       > 0: explodes on impact, hurting everything within this many metres
//   barrel      how long the gun looks in Kirky's hand (1 = pistol)
//   flash       how bright the muzzle flash is (1 = pistol)
//   tracer      [thickness, length] of the bullet streak
//   knock       how hard a hit shoves a monster back (1 = normal)
//   kick        how hard the shot jolts the camera (1 = normal)
//   beam        true: an instant laser that goes through everything in its path until it hits the world
//   scope       true: aiming looks down a scope
//   twoHanded   true: Kirky holds it with both hands

export const WEAPONS = {
  pistol: {
    name: 'Pistol', description: 'Reliable. Never runs out.',
    damage: 10, fireRate: 10, pellets: 1, spreadHip: 1.6, spreadAim: 0.3, speed: 170, life: 1.2,
    pierce: 0, gravity: 0, blast: 0, barrel: 1, flash: 1, tracer: [1, 1],
  },
  machineGun: {
    name: 'Machine Gun', description: 'A hose of bullets. Not very accurate.',
    damage: 7, fireRate: 24, pellets: 1, spreadHip: 3.2, spreadAim: 1.4, speed: 190, life: 1.1,
    pierce: 0, gravity: 0, blast: 0, barrel: 2.3, flash: 0.75, tracer: [0.9, 1.2],
  },
  sniper: {
    name: 'Sniper Rifle', description: 'A scoped .50 cal. One round goes through everything in line.',
    damage: 85, fireRate: 1.2, pellets: 1, spreadHip: 1.5, spreadAim: 0, speed: 0, life: 0,
    pierce: Infinity, gravity: 0, blast: 0, barrel: 3.2, flash: 1.5, tracer: [1, 1],
    knock: 2, kick: 6, beam: true, scope: true, twoHanded: true,
  },
  shotgun: {
    name: 'Shotgun', description: 'Ten heavy pellets that tear through the front rank and throw it back.',
    damage: 24, fireRate: 2, pellets: 10, spreadHip: 4.5, spreadAim: 2.8, speed: 150, life: 0.48,
    pierce: 1, gravity: 0, blast: 0, barrel: 2, flash: 1.5, tracer: [1.1, 0.8],
    knock: 2.5, kick: 3.5,
  },
  launcher: {
    name: 'Bone Launcher', description: 'Lobs a shell that blows up a whole crowd.',
    damage: 45, fireRate: 0.9, pellets: 1, spreadHip: 1, spreadAim: 0.3, speed: 55, life: 4,
    pierce: 0, gravity: 14, blast: 6, barrel: 2.2, flash: 1.3, tracer: [4, 0.35],
    kick: 3, twoHanded: true,
  },
};
for (const id in WEAPONS) Object.assign(WEAPONS[id], { id, knock: WEAPONS[id].knock ?? 1, kick: WEAPONS[id].kick ?? 1 });
