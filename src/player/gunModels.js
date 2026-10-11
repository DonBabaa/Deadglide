// The guns Kirky holds, built from simple shapes. One model per weapon in
// weapons.js (same ids).
//
// A gun is modelled around its pistol grip: the hand holds it at the origin,
// the barrel points along +Z and sits a little above the hand. Each entry gives
//   group    the model (added to the gun arm, one shown at a time)
//   muzzle   where bullets leave it    } both measured from the hand,
//   support  where the other hand goes } in metres
//
// `metal` is the main finish, shared by every gun, so the "gold gun" cosmetic
// can repaint it. Wood, polymer and bone keep their own colours.
import * as THREE from 'three';

const HALF = Math.PI / 2;

export function buildGuns(metal) {
  const std = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const steel = std(0x6a7078, 0.35, { metalness: 0.5 }), polymer = std(0x0d0e10, 0.85), wood = std(0x5e3a1c, 0.6);
  const bone = std(0xd9d2bd, 0.75), boneDark = std(0x9d957f, 0.85), brass = std(0xc79a3a, 0.4, { metalness: 0.4 });
  const glass = new THREE.MeshBasicMaterial({ color: 0x7fd4ff, toneMapped: false });

  const mesh = (geometry, material, x = 0, y = 0, z = 0, rx = 0) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    return m;
  };
  const box = (w, h, d, material, x, y, z, rx) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, rx);
  // A tube lying along the barrel, from z = from to z = to.
  const tube = (radius, from, to, material, y = 0, x = 0, tip = radius, sides = 12) =>
    mesh(new THREE.CylinderGeometry(tip, radius, to - from, sides).rotateX(HALF), material, x, y, (from + to) / 2);
  const ring = (radius, thick, material, y, z) => mesh(new THREE.TorusGeometry(radius, thick, 6, 16), material, 0, y, z);
  const grip = (material, lean = 0.22, length = 0.115) => box(0.034, length, 0.05, material, 0, -0.055, -0.012, lean);   // what the hand holds
  const guard = (z = 0.045) => mesh(new THREE.TorusGeometry(0.024, 0.005, 5, 12, Math.PI).rotateY(HALF).rotateX(Math.PI), metal, 0, -0.012, z);   // trigger guard
  // scale: drawn a little larger than life so it reads from the chase camera.
  // inset: long guns sit slightly inboard of the hand and a touch higher, so the stock runs beside his forearm, not through it.
  const gun = (parts, muzzle, support, scale = 1.25, inset = [-0.05, 0.03]) => {
    const group = new THREE.Group();
    group.add(...parts);
    group.scale.setScalar(scale);
    group.position.set(inset[0], inset[1], 0);
    const placed = ([y, z]) => new THREE.Vector3(inset[0], inset[1] + y * scale, z * scale);
    return { group, muzzle: placed(muzzle), support: placed(support) };
  };

  return {
    // Semi-automatic pistol: slide over a frame, sights, hammer, a magazine base poking out of the grip.
    pistol: gun([
      box(0.036, 0.046, 0.21, metal, 0, 0.046, 0.065),                 // slide
      box(0.03, 0.024, 0.17, polymer, 0, 0.014, 0.06),                 // frame
      tube(0.011, 0.16, 0.185, steel, 0.05),                           // barrel poking out of the slide
      box(0.037, 0.03, 0.012, steel, 0, 0.05, 0.01), box(0.037, 0.03, 0.012, steel, 0, 0.05, -0.012),   // slide serrations
      box(0.006, 0.012, 0.012, steel, 0, 0.075, 0.155),                // front sight
      box(0.02, 0.012, 0.012, steel, 0, 0.075, -0.03),                 // rear sight
      box(0.012, 0.022, 0.016, steel, 0, 0.06, -0.047, -0.5),          // hammer
      grip(polymer), box(0.036, 0.012, 0.054, steel, 0, -0.117, -0.025, 0.22),   // grip, magazine base
      guard(), box(0.006, 0.022, 0.008, steel, 0, -0.008, 0.04, 0.3),   // trigger guard, trigger
    ], [0.05, 0.19], [-0.02, 0.06], 1.45, [0, 0]),

    // Assault rifle: receiver, ribbed handguard, curved magazine, shoulder stock, carry-handle sights.
    machineGun: gun([
      box(0.046, 0.07, 0.3, metal, 0, 0.04, 0.07),                     // receiver
      box(0.05, 0.058, 0.22, polymer, 0, 0.04, 0.33),                  // handguard...
      ...[0.25, 0.3, 0.35, 0.4].map((z) => box(0.053, 0.012, 0.02, metal, 0, 0.055, z)),   // ...with vents along the top
      tube(0.011, 0.44, 0.6, steel, 0.045),                            // barrel
      tube(0.016, 0.57, 0.63, metal, 0.045, 0, 0.018),                 // flash hider
      box(0.008, 0.045, 0.02, metal, 0, 0.082, 0.47), tube(0.004, 0.2, 0.47, steel, 0.066),   // front sight post, gas tube
      box(0.02, 0.022, 0.2, metal, 0, 0.094, 0.07), box(0.012, 0.03, 0.02, metal, 0, 0.082, 0.16), box(0.012, 0.03, 0.02, metal, 0, 0.082, -0.02),   // carry handle
      box(0.036, 0.17, 0.062, steel, 0, -0.075, 0.15, -0.28),          // magazine, raked forward
      tube(0.016, -0.3, -0.08, metal, 0.045),                          // buffer tube
      box(0.04, 0.09, 0.16, polymer, 0, 0.03, -0.27), box(0.044, 0.1, 0.02, polymer, 0, 0.025, -0.355),   // stock, butt pad
      box(0.036, 0.02, 0.006, brass, 0.022, 0.055, 0.09),              // ejection port
      grip(polymer, 0.3), guard(0.05),
    ], [0.045, 0.64], [-0.005, 0.33]),

    // Anti-materiel rifle: long fluted barrel with a big muzzle brake, bipod, box magazine, telescopic sight.
    sniper: gun([
      box(0.05, 0.078, 0.38, metal, 0, 0.04, 0.06),                    // receiver
      box(0.044, 0.05, 0.3, polymer, 0, 0.03, 0.38),                   // fore-end
      tube(0.017, 0.5, 1.02, steel, 0.05, 0, 0.014),                   // barrel
      ...[0.6, 0.7, 0.8, 0.9].map((z) => ring(0.019, 0.004, metal, 0.05, z)),   // fluting bands
      box(0.06, 0.04, 0.1, metal, 0, 0.05, 1.07), box(0.066, 0.02, 0.022, polymer, 0, 0.05, 1.05), box(0.066, 0.02, 0.022, polymer, 0, 0.05, 1.09),   // muzzle brake and its ports
      box(0.04, 0.11, 0.075, steel, 0, -0.06, 0.2),                    // magazine
      box(0.042, 0.075, 0.3, polymer, 0, 0.02, -0.3), box(0.036, 0.03, 0.14, polymer, 0, 0.07, -0.27),   // stock, cheek rest
      box(0.046, 0.11, 0.022, polymer, 0, 0.012, -0.46),               // butt pad
      box(0.01, 0.014, 0.03, steel, 0.03, 0.06, 0.02), mesh(new THREE.SphereGeometry(0.013, 8, 6), polymer, 0.046, 0.06, 0.02),   // bolt handle
      ...[-1, 1].map((s) => mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6), steel, s * 0.045, -0.06, 0.6, 0.45)),          // bipod legs, folded forward
      box(0.1, 0.012, 0.02, metal, 0, 0.012, 0.56),                    // bipod yoke
      // Telescopic sight: tube, bells, mounts and a glinting lens.
      tube(0.022, -0.02, 0.3, metal, 0.125), tube(0.026, 0.3, 0.38, metal, 0.125, 0, 0.034), tube(0.03, -0.08, -0.02, metal, 0.125, 0, 0.028),
      box(0.02, 0.05, 0.03, metal, 0, 0.095, 0.05), box(0.02, 0.05, 0.03, metal, 0, 0.095, 0.23),
      mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), metal, 0, 0.155, 0.14), mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8).rotateZ(HALF), metal, 0.03, 0.125, 0.14),   // turrets
      mesh(new THREE.CircleGeometry(0.031, 16), glass, 0, 0.125, 0.382),
      grip(polymer, 0.25), guard(0.05),
    ], [0.05, 1.13], [-0.005, 0.4]),

    // Pump-action shotgun: fat barrel over a magazine tube, wooden pump and stock, bead sight.
    shotgun: gun([
      box(0.046, 0.072, 0.27, metal, 0, 0.04, 0.06),                   // receiver
      tube(0.018, 0.19, 0.78, steel, 0.058),                           // barrel
      tube(0.015, 0.19, 0.66, metal, 0.022),                           // magazine tube under it
      box(0.01, 0.05, 0.02, metal, 0, 0.04, 0.64),                     // the band holding them together
      tube(0.03, 0.34, 0.52, wood, 0.03, 0, 0.03, 10),                 // pump...
      ...[0.37, 0.41, 0.45, 0.49].map((z) => ring(0.031, 0.004, polymer, 0.03, z)),   // ...with grooves cut in it
      mesh(new THREE.SphereGeometry(0.006, 6, 5), brass, 0, 0.08, 0.76),              // bead sight
      box(0.03, 0.02, 0.07, polymer, 0.024, 0.045, 0.08),              // ejection port
      box(0.042, 0.075, 0.1, wood, 0, 0.012, -0.09, 0.25),             // wrist of the stock
      box(0.042, 0.1, 0.24, wood, 0, -0.012, -0.26, 0.1), box(0.046, 0.115, 0.02, polymer, 0, -0.025, -0.385, 0.1),   // stock, butt pad
      guard(0.05), box(0.006, 0.022, 0.008, steel, 0, -0.008, 0.045, 0.3),
    ], [0.058, 0.79], [0.0, 0.43]),

    // Hand Cannon: a huge revolver. Long heavy barrel, fluted cylinder, wooden grip.
    revolver: gun([
      box(0.034, 0.05, 0.1, metal, 0, 0.04, 0.02),                     // frame
      tube(0.03, 0.035, 0.105, steel, 0.045, 0, 0.03, 8),              // cylinder
      ...[0, 1, 2, 3].map((k) => box(0.006, 0.006, 0.06, polymer, Math.cos(k * 1.6 + 0.4) * 0.027, 0.045 + Math.sin(k * 1.6 + 0.4) * 0.027, 0.07)),   // its flutes
      tube(0.016, 0.105, 0.34, metal, 0.052),                          // barrel
      box(0.014, 0.022, 0.22, metal, 0, 0.03, 0.22),                   // the lug under it
      box(0.008, 0.016, 0.014, steel, 0, 0.076, 0.33),                 // front sight
      box(0.018, 0.012, 0.02, steel, 0, 0.072, -0.02),                 // rear sight
      box(0.012, 0.03, 0.016, steel, 0, 0.066, -0.042, -0.6),          // hammer
      box(0.04, 0.12, 0.052, wood, 0, -0.058, -0.016, 0.24),           // grip
      guard(), box(0.006, 0.022, 0.008, steel, 0, -0.008, 0.04, 0.3),
    ], [0.052, 0.35], [-0.02, 0.06], 1.5, [0, 0]),

    // Frostbite: a boxy sprayer with a glowing canister of coolant on top and a ringed nozzle.
    cryo: gun([
      box(0.05, 0.06, 0.24, metal, 0, 0.04, 0.07),                     // body
      box(0.044, 0.04, 0.12, polymer, 0, 0.035, 0.25),                 // fore-end
      tube(0.016, 0.3, 0.42, steel, 0.04),                             // nozzle
      ...[0.33, 0.37, 0.41].map((z) => ring(0.02, 0.005, metal, 0.04, z)),   // cooling rings
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.13, 10).rotateX(HALF), glass, 0, 0.1, 0.06),   // the canister
      mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.02, 10).rotateX(HALF), metal, 0, 0.1, 0.13), mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.02, 10).rotateX(HALF), metal, 0, 0.1, -0.01),   // its caps
      tube(0.006, 0.13, 0.28, steel, 0.085),                           // feed pipe
      grip(polymer, 0.25), guard(0.05),
    ], [0.04, 0.43], [-0.01, 0.25], 1.3, [0, 0]),

    // Sawblade Launcher: a wide flat tray with the next blade lying in it, a drum of spares underneath.
    saw: gun([
      box(0.05, 0.07, 0.3, metal, 0, 0.04, 0.06),                      // body
      box(0.24, 0.022, 0.28, polymer, 0, 0.05, 0.36),                  // the tray
      ...[-1, 1].map((s) => box(0.014, 0.034, 0.28, metal, s * 0.12, 0.062, 0.36)),   // its rails
      mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.01, 10), steel, 0, 0.07, 0.4),  // a blade, loaded
      mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 8), brass, 0, 0.074, 0.4),  // its hub
      box(0.25, 0.012, 0.016, metal, 0, 0.075, 0.495),                 // the lip it leaves over
      mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.075, 12).rotateZ(HALF), steel, 0, -0.035, 0.2),   // drum of spare blades
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8).rotateZ(HALF), brass, 0, -0.035, 0.2),
      box(0.04, 0.08, 0.15, polymer, 0, 0.03, -0.15), box(0.044, 0.09, 0.02, polymer, 0, 0.025, -0.23),   // stock
      grip(polymer, 0.28), guard(0.05),
    ], [0.07, 0.52], [-0.005, 0.32]),

    // Flamethrower: a fuel tank slung under a long pipe, a heat shield, and a pilot light burning at the nozzle.
    flamer: gun([
      box(0.046, 0.06, 0.26, metal, 0, 0.04, 0.05),                    // body
      tube(0.014, 0.18, 0.7, steel, 0.05),                             // the pipe
      tube(0.024, 0.34, 0.6, polymer, 0.05, 0, 0.024, 10),             // heat shield...
      ...[0.38, 0.44, 0.5, 0.56].map((z) => ring(0.025, 0.004, metal, 0.05, z)),   // ...with vents
      tube(0.02, 0.7, 0.78, metal, 0.05, 0, 0.03),                     // flared nozzle
      mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }), 0, 0.078, 0.77),   // pilot light
      tube(0.045, 0.02, 0.3, brass, -0.035, 0, 0.045, 12),             // fuel tank
      mesh(new THREE.SphereGeometry(0.045, 12, 8), brass, 0, -0.035, 0.3), mesh(new THREE.SphereGeometry(0.045, 12, 8), brass, 0, -0.035, 0.02),   // its rounded ends
      tube(0.007, 0.3, 0.36, steel, 0.0),                              // fuel line up to the pipe
      box(0.04, 0.08, 0.14, polymer, 0, 0.03, -0.14), box(0.044, 0.09, 0.02, polymer, 0, 0.025, -0.215),   // stock
      grip(polymer, 0.28), guard(0.05),
    ], [0.05, 0.8], [0.0, 0.42]),

    // Bone Launcher: a fat tube lashed together out of bone, a jawbone foregrip, a skull for a rear sight.
    launcher: gun([
      tube(0.062, 0.02, 0.56, bone, 0.06, 0, 0.062, 14),               // the tube
      tube(0.062, 0.56, 0.66, bone, 0.06, 0, 0.085, 14),               // flared mouth
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 14, 1, true).rotateX(HALF), polymer, 0, 0.06, 0.661),   // (dark inside it)
      mesh(new THREE.CircleGeometry(0.068, 14), polymer, 0, 0.06, 0.63),
      ...[0.08, 0.22, 0.36, 0.5].map((z) => ring(0.066, 0.009, metal, 0.06, z)),   // iron bands
      tube(0.05, -0.2, 0.02, boneDark, 0.06, 0, 0.062, 12),            // breech
      mesh(new THREE.SphereGeometry(0.055, 12, 8, 0, Math.PI * 2, 0, HALF).rotateX(-HALF), boneDark, 0, 0.06, -0.2),   // rounded end cap
      ...[-1, 1].map((s) => mesh(new THREE.SphereGeometry(0.022, 8, 6), bone, s * 0.03, 0.125, -0.02)),   // knuckle ends of a bone lashed along the top...
      tube(0.012, -0.02, 0.3, bone, 0.125),                                                              // ...and its shaft
      ...[-1, 1].map((s) => mesh(new THREE.SphereGeometry(0.02, 8, 6), bone, s * 0.022, 0.125, 0.3)),
      mesh(new THREE.SphereGeometry(0.036, 10, 8), bone, 0, 0.16, 0.1), box(0.04, 0.02, 0.03, boneDark, 0, 0.133, 0.115),          // a small skull for a sight: dome, jaw
      ...[-1, 1].map((s) => mesh(new THREE.SphereGeometry(0.009, 6, 5), polymer, s * 0.014, 0.163, 0.132)),                        // its eye sockets
      box(0.03, 0.1, 0.04, boneDark, 0, -0.045, 0.38, -0.2),           // jawbone foregrip
      grip(boneDark, 0.2, 0.11), guard(0.05),
    ], [0.06, 0.68], [-0.07, 0.385]),
  };
}
