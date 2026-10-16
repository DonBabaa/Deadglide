// The lock on the Moon lift's call button (his ask: not its lamp any more, a lock on the button, to be shot).
// A lockout, as a real one is: a steel cover over the call panel's buttons, hinged at its top, yellow and black,
// clamped down by a hasp at its foot; through the hasp's staple a heavy laminated padlock (plates of steel riveted
// into a block, a chrome shackle, a bumper at the foot with a brass keyway); off its shackle on a wire, a red tag:
// DANGER, LOCKED OUT, DO NOT OPERATE. Shot: sparks, the shackle snaps open, the lock drops to the dust (at the Moon's
// pull: slowly) and bounces, the tag flutters down after it, the cover swings up off the buttons and its lamp goes green.
//
//   const lock = buildLockout(cage, { x, y, z });   x, y, z: the middle of the panel's face, in the cage's space (its front: -z)
//   lock.hit(ray) -> true if a ray goes through it (a little bigger than it is: it is small, and you are far off)
//   lock.break()  lock.update(dt)  lock.broken
import * as THREE from 'three';

const GRAVITY = 9.8 * 0.34;   // (the Moon's, as Free Ride has it)

function hazardTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#e0b021'; g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#16171a';
  for (let k = -160; k < 288; k += 36) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 18, 0); g.lineTo(k + 18 - 160, 160); g.lineTo(k - 160, 160); g.closePath(); g.fill(); }
  // (worn: the paint rubbed through to the steel at the edges and where hands have been, and dirt in the corners)
  for (let i = 0; i < 260; i++) { const x = Math.random() * 128, y = Math.random() * 160, edge = Math.min(x, 128 - x, y, 160 - y); if (edge > 14 && Math.random() < 0.8) continue; g.fillStyle = `rgba(150,150,155,${0.25 + Math.random() * 0.4})`; g.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 2); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,30,20,${0.08 + Math.random() * 0.12})`; g.beginPath(); g.arc(Math.random() * 128, Math.random() * 160, 3 + Math.random() * 9, 0, 7); g.fill(); }
  // (a stencil across it)
  g.fillStyle = 'rgba(14,14,16,0.92)'; g.fillRect(10, 64, 108, 30);
  g.fillStyle = '#e0b021'; g.font = '700 19px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.fillText('LOCKED OUT', 64, 87);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function tagTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 224;
  const g = c.getContext('2d');
  g.fillStyle = '#f1ece0'; g.fillRect(0, 0, 128, 224);
  g.fillStyle = '#c4201a'; g.fillRect(0, 0, 128, 78);
  g.fillStyle = '#f1ece0'; g.beginPath(); g.arc(64, 20, 10, 0, 7); g.fill();   // (its grommet's hole)
  g.strokeStyle = '#8d8a80'; g.lineWidth = 3; g.beginPath(); g.arc(64, 20, 12, 0, 7); g.stroke();
  g.fillStyle = '#ffffff'; g.font = '700 30px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.fillText('DANGER', 64, 66);
  g.fillStyle = '#1b1b1d'; g.font = '700 24px Anton, Impact, sans-serif'; g.fillText('LOCKED', 64, 112); g.fillText('OUT', 64, 138);
  g.font = '600 15px "Barlow Condensed", sans-serif'; g.fillText('DO NOT OPERATE', 64, 166);
  g.font = 'italic 600 12px "Barlow Condensed", sans-serif'; g.fillStyle = '#4a4740'; g.fillText('by order of Dome Control', 64, 190);
  g.strokeStyle = '#2a2a2e'; g.lineWidth = 1; g.beginPath(); g.moveTo(16, 204); g.lineTo(112, 204); g.stroke();
  g.font = 'italic 13px "Barlow Condensed", sans-serif'; g.fillStyle = '#3a3a8a'; g.fillText('J. Park  ·  day 1', 64, 200);   // (signed: the station's last engineer)
  // (handled: a thumbprint of grease, a crease)
  g.fillStyle = 'rgba(60,45,30,0.18)'; g.beginPath(); g.ellipse(96, 150, 12, 16, 0.4, 0, 7); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.moveTo(0, 120); g.lineTo(128, 128); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// A plate of the lock's body: a rounded oblong, extruded upward.
function plateGeometry(w, d, h, r) {
  const s = new THREE.Shape(), x = w / 2, z = d / 2;
  s.moveTo(-x + r, -z); s.lineTo(x - r, -z); s.quadraticCurveTo(x, -z, x, -z + r); s.lineTo(x, z - r); s.quadraticCurveTo(x, z, x - r, z);
  s.lineTo(-x + r, z); s.quadraticCurveTo(-x, z, -x, z - r); s.lineTo(-x, -z + r); s.quadraticCurveTo(-x, -z, -x + r, -z);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 1, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);   // (lying flat: its height up)
  return g;
}

export function buildLockout(cage, { x, y, z }) {
  const steel = new THREE.MeshStandardMaterial({ color: 0xc7ccd3, metalness: 1, roughness: 0.18 });       // (the shackle: chromed)
  const plateA = new THREE.MeshStandardMaterial({ color: 0x8a8f97, metalness: 0.9, roughness: 0.38 });
  const plateB = new THREE.MeshStandardMaterial({ color: 0x777c84, metalness: 0.9, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x18191c, metalness: 0.5, roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc09444, metalness: 0.95, roughness: 0.3 });
  const coverM = new THREE.MeshStandardMaterial({ map: hazardTexture(), metalness: 0.45, roughness: 0.55 });
  const edgeM = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, metalness: 0.7, roughness: 0.45 });
  const root = new THREE.Group(); cage.add(root);
  const shadowed = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

  // The cover: hinged along its top, a little proud of the panel's face, over its buttons.
  const W = 0.15, H = 0.2, top = y + 0.06;   // (over both buttons; the screen above it still shows)
  const flap = new THREE.Group(); flap.position.set(x, top, z - 0.012); root.add(flap);
  { const c = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.01), [edgeM, edgeM, edgeM, edgeM, edgeM, coverM]); c.position.set(0, -H / 2, -0.006); flap.add(c); }   // (its face, out front (-z): the striped one)
  for (const [w, h, px, py] of [[W + 0.008, 0.008, 0, -0.004], [W + 0.008, 0.008, 0, -H + 0.004], [0.008, H, -W / 2, -H / 2], [0.008, H, W / 2, -H / 2]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), edgeM); e.position.set(px, py, -0.004); flap.add(e); }   // (its folded edges)
  for (const k of [-1, 0, 1]) { const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.034, 10), k ? edgeM : steel); kn.rotation.z = Math.PI / 2; kn.position.set(k * 0.05, 0, -0.006); flap.add(kn); }   // (the hinge's knuckles, the pin's middle one bright)
  for (const sx of [-1, 1]) for (const sy of [0.02, H - 0.02]) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), steel); r.position.set(sx * (W / 2 - 0.018), -sy, -0.013); flap.add(r); }   // (rivets)
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false })); led.position.set(W / 2 - 0.022, -0.03, -0.014); flap.add(led);
  const ledLight = new THREE.PointLight(0xff2a14, 0.35, 0.9, 2); ledLight.position.set(W / 2 - 0.022, -0.03, -0.05); flap.add(ledLight);
  // (the hasp: a strap off its foot, with a slot that the staple on the panel comes through)
  { const s = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.064, 0.005), edgeM); s.position.set(0, -H - 0.026, -0.008); flap.add(s); const slot = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.026, 0.006), dark); slot.position.set(0, -H - 0.034, -0.009); flap.add(slot); }
  // The staple, on the panel itself: a steel loop standing out through the slot.
  const stapleY = top - H - 0.034;
  { const st = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0028, 8, 16, Math.PI), steel); st.position.set(x, stapleY, z - 0.02); st.rotation.set(Math.PI / 2, 0, 0); root.add(st); const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.004), edgeM); plate.position.set(x, stapleY, z - 0.004); root.add(plate); }

  // The padlock, hung on the staple by its shackle.
  const lock = new THREE.Group(); lock.position.set(x, stapleY, z - 0.022); root.add(lock);   // (its shackle through the staple)
  const BW = 0.088, BD = 0.036, PH = 0.0085, N = 8, BTOP = -0.034;
  // (its shackle: a U of chromed bar, one leg longer: it is that one that comes out of the body when it is opened)
  const shackle = new THREE.Group(); shackle.position.set(-0.022, BTOP, 0); lock.add(shackle);
  {
    const R = 0.022, legL = 0.04, legR = 0.03, pts = [];
    for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(0, -0.012 + (legL * i) / 6, 0));
    for (let i = 1; i < 16; i++) { const a = Math.PI - (Math.PI * i) / 16; pts.push(new THREE.Vector3(R + Math.cos(a) * R, legL - 0.012 + Math.sin(a) * R, 0)); }
    for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(2 * R, legL - 0.012 - ((legR - 0.004) * i) / 6, 0));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0052, 10, false), steel);
    shackle.add(tube);
    shackle.userData.R = R;
  }
  // (its body: plates riveted into a block, the light catching each edge; a bumper at its foot with the keyway in it)
  const body = new THREE.Group(); lock.add(body);
  for (let i = 0; i < N; i++) { const p = new THREE.Mesh(plateGeometry(BW - (i === 0 || i === N - 1 ? 0.002 : 0), BD, PH - 0.0008, 0.009), i % 2 ? plateA : plateB); p.position.y = BTOP - (i + 1) * PH; body.add(p); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const rv = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, N * PH + 0.003, 8), plateA); rv.position.set(sx * (BW / 2 - 0.009), BTOP - (N * PH) / 2, sz * (BD / 2 - 0.007)); body.add(rv); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0036, 8, 6), steel); cap.position.set(rv.position.x, BTOP + 0.0005, rv.position.z); body.add(cap); }   // (its rivets, through all of it)
  const bottom = BTOP - N * PH;
  { const bump = new THREE.Mesh(plateGeometry(BW + 0.004, BD + 0.004, 0.011, 0.011), dark); bump.position.y = bottom - 0.012; body.add(bump);
    const key = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.004, 18), brass); key.position.set(0.006, bottom - 0.0135, 0); body.add(key);
    const way = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.002, 0.012), dark); way.position.set(0.006, bottom - 0.0158, 0); body.add(way); }
  // (stamped on its front plate: whose it is)
  { const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 128, 32); g.fillStyle = 'rgba(20,20,24,0.75)'; g.font = '700 17px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillText('SHACKLETON STN', 64, 22);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const stamp = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.0175), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); stamp.position.set(0, BTOP - 4 * PH, -BD / 2 - 0.0016); stamp.rotation.y = Math.PI; body.add(stamp); }
  // The tag, on a wire off the shackle's short leg, hanging down in front of the lock.
  const tag = new THREE.Group(); tag.position.set(0.022, BTOP + 0.01, -0.008); lock.add(tag);
  { const wire = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0012, 6, 16), steel); wire.position.y = -0.006; tag.add(wire);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.091), new THREE.MeshStandardMaterial({ map: tagTexture(), roughness: 0.9, side: THREE.DoubleSide })); card.position.set(0, -0.06, -0.003); card.rotation.y = Math.PI; tag.add(card);
    tag.rotation.set(0.08, 0.35, -0.22); }
  shadowed(root);

  // ---- Shot
  const sparks = Array.from({ length: 12 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.visible = false; s.scale.setScalar(0.03); root.add(s); return { s, v: new THREE.Vector3(), life: 0 }; });
  const hitAt = new THREE.Vector3();
  const fall = { v: new THREE.Vector3(), spin: new THREE.Vector3(), rest: false, bounced: 0 }, flutter = { v: new THREE.Vector3(), t: 0, rest: false };
  const api = {
    broken: false, t: 0,
    // (where it is: its body's middle, in the world)
    where(out) { return body.localToWorld(out.set(0, BTOP - (N * PH) / 2, 0)); },
    hit(ray) {
      if (api.broken) return false;
      // (the lock, or the cover it holds down: either is the lock shot off)
      for (const [at, r] of [[api.where(hitAt), 0.15], [flap.localToWorld(hitAt.clone().set(0, -H / 2, -0.01)), 0.13]]) {
        const along = at.clone().sub(ray.origin).dot(ray.direction);
        if (along > 0 && ray.distanceSqToPoint(at) < r * r) return true;
      }
      return false;
    },
    break() {
      if (api.broken) return;
      api.broken = true; api.t = 0;
      api.where(hitAt); root.worldToLocal(hitAt);
      for (const p of sparks) { p.life = 0.25 + Math.random() * 0.35; p.s.visible = true; p.s.position.copy(hitAt); p.v.set((Math.random() - 0.5) * 2.2, Math.random() * 1.8, -Math.random() * 1.6 - 0.3); }
      // (the shackle snaps open: its long leg out of the body, turned aside)
      shackle.position.y += 0.012; shackle.rotation.y = 1.1;
      // (off the staple: knocked out from the panel, a little up, turning over)
      fall.v.set((Math.random() - 0.5) * 0.5, 0.6, -0.9); fall.spin.set(4 + Math.random() * 3, (Math.random() - 0.5) * 6, 2 + Math.random() * 2);
      // (the tag goes its own way, slower)
      root.attach(tag); flutter.v.set(0.15, 0.25, -0.35); flutter.t = 0;
      led.material.color.set(0x3aff6a); ledLight.color.set(0x3aff6a);
    },
    update(dt) {
      if (!api.broken) { const blink = Math.sin(performance.now() / 1000 * 4) > 0; led.material.color.set(blink ? 0xff2a14 : 0x3a0a06); ledLight.intensity = blink ? 0.35 : 0.05; return; }
      api.t += dt;
      // the cover: swung up off the buttons, over its hinge, and settling
      const t = api.t, swing = 1.95 * (1 - Math.exp(-6 * t) * Math.cos(9 * t));
      flap.rotation.x = Math.max(0, swing);
      ledLight.intensity = 0.4;
      for (const p of sparks) { if (p.life <= 0) { p.s.visible = false; continue; } p.life -= dt; p.v.y -= GRAVITY * dt; p.s.position.addScaledVector(p.v, dt); p.s.material.opacity = Math.min(1, p.life * 4); }
      // the lock: down to the dust (the cage's floor is at 0: its foot, the ground), bouncing once, and lying there
      if (!fall.rest) {
        fall.v.y -= GRAVITY * dt;
        lock.position.addScaledVector(fall.v, dt);
        lock.rotation.x += fall.spin.x * dt; lock.rotation.y += fall.spin.y * dt; lock.rotation.z += fall.spin.z * dt;
        if (lock.position.y < 0.05) {
          lock.position.y = 0.05;
          if (fall.bounced++ < 1 && fall.v.y < -0.6) { fall.v.y *= -0.32; fall.v.x *= 0.5; fall.v.z *= 0.5; fall.spin.multiplyScalar(0.4); api.clank?.(); }
          else { fall.rest = true; lock.rotation.set(Math.PI / 2, lock.rotation.y, 0); api.clank?.(); }   // (on its side)
        }
      }
      if (!flutter.rest) {
        flutter.t += dt;
        flutter.v.y = Math.max(-0.35, flutter.v.y - GRAVITY * 0.35 * dt);   // (a card: it does not fall like the lock does)
        tag.position.addScaledVector(flutter.v, dt);
        tag.position.x += Math.sin(flutter.t * 7) * 0.12 * dt;
        tag.rotation.z = Math.sin(flutter.t * 6) * 0.6; tag.rotation.x = 0.4 + Math.sin(flutter.t * 4.3) * 0.3;
        if (tag.position.y < 0.01) { tag.position.y = 0.01; tag.rotation.set(-Math.PI / 2, tag.rotation.y, 0.3); flutter.rest = true; }
      }
    },
  };
  return api;
}
