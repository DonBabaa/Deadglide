// The bar: a skeleton barman in a waistcoat, and the drinks he makes.
//
// Sit on a stool and order, and he puts on a show: glides over, bows, shakes
// or spins the bottle, tosses it in the air and catches it, sets a glass down,
// pours, drops in a garnish, slides the glass across the marble and bows again.
// Then the drink is yours to drink (room.js lifts it to Kirky's mouth).
//
// It is filmed like a cooking cut-in from an arcade game: hard cuts between
// close-ups, snap zooms, speed lines, slow motion on the toss, a flash on the
// catch. shot() says where the camera should be at each moment; room.js puts it there.
//
// room.js owns the room; this file owns everything behind the counter.
import * as THREE from 'three';
import { ENEMY_PARTS } from '../enemies/enemyModels.js';
import { playShake, playPour, playClink, playCork, playGlassDown } from '../fx/audio.js';

export const DRINKS = [
  { id: 'whisky', name: 'Whisky', price: 10, liquid: 0xc9792a, tool: 'bottle', bottle: 0x5a3414 },
  { id: 'martini', name: 'Dry Martini', price: 20, liquid: 0xe6f0c4, tool: 'shaker' },
  { id: 'champagne', name: 'Champagne', price: 40, liquid: 0xf2d27a, tool: 'bottle', bottle: 0x1f4a2a, cork: true },
];

const MAKE_TIME = 6.9;   // seconds for the whole performance (on its own clock: the toss runs in slow motion)
export const GLASS_SIZE = 1.6;   // glasses are drawn larger than life so you can see what you're getting
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const span = (t, from, to) => smooth((t - from) / (to - from));   // 0 before `from`, easing to 1 at `to`
const lerp = (a, b, t) => a + (b - a) * t;
const v = new THREE.Vector3();

export class Bar {
  // counterY: height of the bar top. serveX: where a served drink sits (in front of the customer). backX: where the barman stands.
  constructor(scene, { counterY, serveX, backX, homeZ }) {
    this.scene = scene;
    this.at = { counterY, serveX, backX, homeZ };
    const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    this.mats = {
      glass: new THREE.MeshStandardMaterial({ color: 0xdfeef5, roughness: 0.08, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
      steel: std(0xc9ced4, 0.2, { metalness: 0.7 }),
      gold: std(0xd9b24a, 0.3, { metalness: 0.35, emissive: 0x3a2a08 }),
    };
    const add = (geometry, material, x, y, z, parent) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); parent.add(m); return m; };
    this.add = add;

    // ---- The barman: a skeleton in a black waistcoat and bow tie, a towel over one arm ----
    const b = (this.barman = new THREE.Group());
    b.rotation.order = 'YXZ';       // (turn to face the room first, then bow)
    b.rotation.y = -Math.PI / 2;
    b.position.set(backX, 0, homeZ);
    b.scale.setScalar(1.12);   // (a tall fellow: he has to be seen over the bar)
    const bone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const eyes = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.arms = [];
    for (const part of ENEMY_PARTS.rattler()) {
      const m = new THREE.Mesh(part.geometry, part.glow ? eyes : bone);
      m.position.set(...part.pivot);
      b.add(m);
      if (part.pivot[1] > 1.4 && part.pivot[0] !== 0) this.arms.push(m);   // (they hinge at the shoulder; the hand is at 0, -0.42, 0.3)
    }
    this.arms.sort((p, q) => p.position.x - q.position.x);   // [his right, his left]
    const black = std(0x111114, 0.5, { side: THREE.DoubleSide }), white = std(0xf3f0e8, 0.7), red = std(0xa3101a, 0.4);
    add(new THREE.CylinderGeometry(0.17, 0.15, 0.36, 14, 1, true, 0.45, Math.PI * 2 - 0.9).scale(1, 1, 0.8), black, 0, 1.28, 0.01, b);   // waistcoat, open down the front
    add(new THREE.BoxGeometry(0.1, 0.34, 0.02), white, 0, 1.29, 0.125, b);                                                             // shirt front
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.045, 0.07, 4).rotateZ(s * Math.PI / 2), red, s * 0.04, 1.49, 0.13, b);        // bow tie
    for (const y of [1.2, 1.28, 1.36]) add(new THREE.SphereGeometry(0.011, 6, 5), this.mats.gold, 0.04, y, 0.137, b);                   // waistcoat buttons
    add(new THREE.BoxGeometry(0.11, 0.012, 0.012), black, 0, 1.6, 0.15, b);                                                             // a thin moustache...
    for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.02, 0.006, 4, 8, Math.PI).rotateZ(s > 0 ? 0 : Math.PI), black, s * 0.07, 1.607, 0.15, b);   // ...curled at the ends
    add(new THREE.BoxGeometry(0.06, 0.22, 0.012), white, 0, -0.3, 0.3, this.arms[1]);                                                   // the towel over his left forearm

    // What he works with: a shaker and a bottle (one shown at a time, in his right hand), and the stream as he pours.
    this.shaker = new THREE.Group();
    add(new THREE.CylinderGeometry(0.036, 0.03, 0.15, 12), this.mats.steel, 0, 0, 0, this.shaker);
    add(new THREE.CylinderGeometry(0.02, 0.036, 0.05, 12), this.mats.steel, 0, 0.1, 0, this.shaker);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.025, 8), this.mats.steel, 0, 0.135, 0, this.shaker);
    this.bottle = new THREE.Group();
    this.bottleGlass = std(0x5a3414, 0.25);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 12), this.bottleGlass, 0, 0, 0, this.bottle);
    add(new THREE.CylinderGeometry(0.012, 0.03, 0.07, 12), this.bottleGlass, 0, 0.125, 0, this.bottle);
    add(new THREE.CylinderGeometry(0.013, 0.013, 0.05, 8), this.bottleGlass, 0, 0.18, 0, this.bottle);
    add(new THREE.CylinderGeometry(0.036, 0.036, 0.07, 12), white, 0, -0.01, 0, this.bottle);   // label
    this.stream = add(new THREE.CylinderGeometry(0.006, 0.006, 1, 6).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 0, 0, 0, scene);
    this.cork = add(new THREE.CylinderGeometry(0.012, 0.014, 0.03, 8), std(0xc9a26a, 0.9), 0, 0, 0, scene);
    this.sparkle = add(new THREE.RingGeometry(0.05, 0.07, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, toneMapped: false }), 0, 0, 0, scene);
    for (const thing of [this.shaker, this.bottle]) scene.add(thing);
    scene.add(b);

    this.toolAt = new THREE.Vector3();   // where the shaker or bottle is (for the camera)
    this.time = 0;
    this.show = null;   // the performance in progress: { t, drink, glass, z, done }
    this.reset();
  }

  reset() {
    this.show = null;
    this.barman.position.z = this.at.homeZ;
    for (const thing of [this.shaker, this.bottle, this.stream, this.cork, this.sparkle]) thing.visible = false;
  }

  get busy() { return this.show !== null; }

  // The camera's part in the performance: where it is, what it looks at and how far it's zoomed,
  // cut by cut, plus the effects on top (lines: speed lines, flash: a white pop, title: big text).
  // Returns null when nothing is being made.
  shot() {
    const show = this.show;
    if (!show) return null;
    const t = show.t, z = show.z, { counterY, serveX, backX } = this.at, g = show.glass.position, tool = this.toolAt;
    const head = 1.86, at = (x, y, dz) => new THREE.Vector3(x, y, z + dz);
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0);
    const flash = Math.max(pop(2.98), pop(4.95), pop(6.05) * 0.8);
    let s;
    if (t < 0.95) s = { pos: at(backX - 4.0, 2.2, 2.9), look: at(backX - 0.7, 1.45, -0.6), fov: 56 - 8 * span(t, 0, 0.95) };                    // wide: he comes down the bar
    else if (t < 1.4) s = { pos: at(backX - 1.9, 1.72, 0.4), look: at(backX, head - 0.06, 0), fov: 46 - 24 * span(t, 0.95, 1.12), lines: 1 };       // snap zoom: his face
    else if (t < 2.35) s = { pos: at(backX - 0.75, head - 0.05, -0.85), look: tool, fov: 34, shake: 0.012, lines: 0.6 };                      // tight on his hands at work
    else if (t < 3.0) s = { pos: at(backX - 0.95, counterY - 0.05, 0.55), look: tool.clone().lerp(at(backX, head, 0), 0.25), fov: 44 };         // from below: the toss, in slow motion
    else if (t < 3.4) s = { pos: at(g.x - 0.3, counterY + 0.55, 0.42), look: g.clone().setY(counterY + 0.08), fov: 30 };                       // the glass goes down
    else if (t < 4.95) s = { pos: at(g.x - 0.8 + 0.12 * span(t, 3.4, 4.9), counterY + show.glass.lip * 0.9, 0.62), look: g.clone().setY(counterY + show.glass.lip * 0.62), fov: 30 - 6 * span(t, 3.6, 4.8) };   // counter level: the pour
    else if (t < 5.35) s = { pos: at(g.x - 0.55, counterY + show.glass.lip + 0.3, 0.5), look: g.clone().setY(counterY + show.glass.lip * 0.8), fov: 26, lines: 0.5 };   // the garnish
    else if (t < 6.05) s = { pos: new THREE.Vector3(g.x - 0.12, counterY + 0.1, g.z + 0.62), look: g.clone().setY(counterY + 0.12), fov: 34 };    // travelling with the glass down the marble
    else s = { pos: at(serveX - 0.6, counterY + 0.24, 0.5), look: at(backX - 0.5, counterY + 0.32, -0.3), fov: 42 - 6 * span(t, 6.05, 6.9), title: show.drink.name };   // your drink, and his bow behind it
    return { shake: 0, lines: 0, title: '', ...s, flash };
  }

  // A glass of `drink`, standing on y = 0. glass.liquid.scale.y is how full it is (0..1); glass.garnish goes in last.
  makeGlass(drink) {
    const { add, mats } = this, g = new THREE.Group();
    const liquid = new THREE.MeshBasicMaterial({ color: drink.liquid, toneMapped: false });
    const fill = (geometry, y) => { const m = add(geometry, liquid, 0, y, 0, g); m.scale.y = 0.001; return m; };
    if (drink.id === 'whisky') {
      add(new THREE.CylinderGeometry(0.05, 0.042, 0.11, 14, 1, true), mats.glass, 0, 0.055, 0, g);
      add(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 14), mats.glass, 0, 0.006, 0, g);
      g.liquid = fill(new THREE.CylinderGeometry(0.045, 0.041, 0.06, 14).translate(0, 0.03, 0), 0.012);
      g.garnish = add(new THREE.BoxGeometry(0.035, 0.035, 0.035), new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.05, transparent: true, opacity: 0.7 }), 0.005, 0.055, 0, g);   // an ice cube
      g.garnish.rotation.set(0.4, 0.5, 0.2);
      g.lip = 0.11;
    } else if (drink.id === 'martini') {
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 14), mats.glass, 0, 0.003, 0, g);
      add(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 6), mats.glass, 0, 0.055, 0, g);
      add(new THREE.ConeGeometry(0.075, 0.07, 16, 1, true).rotateX(Math.PI), mats.glass, 0, 0.14, 0, g);
      g.liquid = fill(new THREE.ConeGeometry(0.066, 0.058, 16).rotateX(Math.PI).translate(0, 0.029, 0), 0.108);
      const olive = new THREE.Group();   // an olive on a stick
      add(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshStandardMaterial({ color: 0x5f7a2a, roughness: 0.4 }), 0, 0, 0, olive);
      add(new THREE.CylinderGeometry(0.002, 0.002, 0.1, 4).rotateZ(0.9), mats.steel, 0.02, 0.02, 0, olive);
      olive.position.set(0.012, 0.15, 0);
      g.add(olive);
      g.garnish = olive;
      g.lip = 0.175;
    } else {
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.006, 14), mats.glass, 0, 0.003, 0, g);
      add(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 6), mats.glass, 0, 0.05, 0, g);
      add(new THREE.CylinderGeometry(0.03, 0.016, 0.15, 14, 1, true), mats.glass, 0, 0.17, 0, g);
      g.liquid = fill(new THREE.CylinderGeometry(0.027, 0.015, 0.125, 14).translate(0, 0.0625, 0), 0.097);
      g.garnish = add(new THREE.SphereGeometry(0.017, 8, 6).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ color: 0xc8201b, roughness: 0.5 }), 0.03, 0.245, 0, g);   // a strawberry on the rim
      g.lip = 0.245;
    }
    g.garnish.visible = false;
    g.drink = drink;
    g.level = 0;
    g.lip *= GLASS_SIZE;
    g.scale.setScalar(GLASS_SIZE);
    return g;
  }

  // Start making `drink` for the customer sitting at depth z. glass: a fresh makeGlass(). done(): called when it's served.
  order(drink, glass, z, done) {
    if (this.show) return false;
    glass.visible = false;
    this.scene.add(glass);
    this.show = { t: 0, drink, glass, z, done, shaken: 0, marks: {} };
    this.bottleGlass.color.set(drink.bottle || 0x5a3414);
    return true;
  }

  update(dt) {
    this.time += dt;
    const b = this.barman, [right, left] = this.arms, { counterY, serveX, backX, homeZ } = this.at;
    const show = this.show;

    // At rest: at his post, swaying a little, polishing the air with his towel arm.
    let rightArm = 0.12, leftArm = -0.75 + Math.sin(this.time * 3) * 0.12, bow = 0, turn = Math.sin(this.time * 0.5) * 0.25;
    if (!show) {
      b.position.z = lerp(b.position.z, homeZ, 1 - Math.exp(-2 * dt));
      b.position.y = 0;
    } else {
      const t = (show.t += dt * (show.t > 2.35 && show.t < 2.95 ? 0.35 : 1)), { drink, glass } = show,   // (the toss hangs in the air)
      tool = drink.tool === 'shaker' ? this.shaker : this.bottle;
      const once = (name, at, run) => { if (t >= at && !show.marks[name]) { show.marks[name] = true; run(); } };
      turn = 0;

      // 0.0 - 1.0  He glides down the bar to you and bows.
      b.position.z = lerp(b.position.z, show.z, 1 - Math.exp(-5 * dt));
      b.position.y = Math.abs(Math.sin(this.time * 9)) * 0.02 * (1 - span(t, 0.6, 1.0));
      bow = Math.sin(span(t, 0.5, 1.2) * Math.PI) * 0.35;

      // 1.2 - 2.9  The shaker goes over his shoulder (or the bottle spins in his hand), then up in the air and back into his grip.
      const working = span(t, 1.1, 1.4) * (1 - span(t, 5.3, 5.6));
      tool.visible = working > 0.02;
      const shaking = t > 1.4 && t < 2.3 ? 1 : 0, wobble = Math.sin(this.time * 34) * shaking;
      rightArm = lerp(rightArm, -1.75 + wobble * 0.22, working);
      if (drink.tool === 'shaker') leftArm = lerp(leftArm, -1.6 + wobble * 0.22, span(t, 1.2, 1.4) * (1 - span(t, 2.3, 2.5)));
      if (shaking && this.time - show.shaken > 0.11) { show.shaken = this.time; playShake(); }
      const toss = t > 2.3 && t < 3.0 ? (t - 2.3) / 0.7 : -1;   // 0..1 while it's in the air
      // 3.4 - 4.8  He tips it over the glass and pours.
      const pouring = span(t, 3.3, 3.6) * (1 - span(t, 4.7, 4.95));
      rightArm = lerp(rightArm, -1.05, pouring);

      // Where his hand is, and so where the tool is.
      b.rotation.set(bow, -Math.PI / 2 + turn, 0);
      right.rotation.x = rightArm;
      b.updateMatrixWorld(true);
      right.localToWorld(v.set(0, -0.42, 0.3));
      tool.position.copy(v);
      tool.rotation.set(0, 0, 0);
      tool.scale.setScalar(1.35);
      if (drink.tool === 'bottle' && t > 1.4 && t < 2.3) tool.rotation.z = (t - 1.4) * 14;   // twirling it by the neck
      if (toss >= 0) {
        tool.position.y += Math.sin(toss * Math.PI) * 0.75;
        tool.rotation.x = toss * Math.PI * 4;   // two full turns
        rightArm = -1.75 - Math.sin(toss * Math.PI) * 0.5;
        once('caught', 2.98, playClink);
      }

      // 2.9 - 3.3  A glass, set down in front of him with his other hand.
      const glassAt = v.set(backX - 0.62, counterY, show.z).clone();
      once('glass', 3.0, () => { glass.visible = true; playGlassDown(); });
      leftArm = lerp(leftArm, -1.0, span(t, 2.8, 3.0) * (1 - span(t, 3.2, 3.4)));
      const serve = span(t, 5.3, 6.0);
      glass.position.set(lerp(glassAt.x, serveX, serve), counterY + Math.max(0, 0.25 - (t - 3.0) * 1.6), show.z + lerp(0, 0.12, serve));
      glass.scale.setScalar(GLASS_SIZE * Math.min(1, Math.max(0.01, (t - 3.0) * 6)));

      // The pour: the tool tips, a thread of drink runs down into the glass, and the glass fills.
      tool.rotation.z += -2.0 * pouring;
      const poured = span(t, 3.6, 4.7);
      glass.level = poured;
      glass.liquid.scale.y = Math.max(0.001, poured);
      this.stream.visible = pouring > 0.9 && poured < 1;
      if (this.stream.visible) {
        const mouth = tool.localToWorld(v.set(0, 0.2, 0));
        this.stream.position.copy(mouth);
        this.stream.scale.set(1.6, Math.max(0.02, mouth.y - (counterY + 0.03)), 1.6);
        this.stream.material.color.set(drink.liquid);
        tool.position.x += (glassAt.x + 0.02 - mouth.x) * 0.9;   // (held so it falls into the glass)
      }
      once('pour', 3.6, () => { if (drink.cork) playCork(); playPour(); });
      // Champagne: the cork goes first.
      this.cork.visible = !!drink.cork && t > 3.4 && t < 4.1;
      if (this.cork.visible) this.cork.position.set(glassAt.x + 0.3 + (t - 3.4) * 1.5, counterY + 0.6 + (t - 3.4) * 4 - (t - 3.4) ** 2 * 7, show.z + (t - 3.4) * 2);

      // 4.9 - 5.3  The garnish drops in, with a glint.
      once('garnish', 4.95, () => { glass.garnish.visible = true; playClink(); });
      this.sparkle.visible = t > 4.95 && t < 5.5;
      if (this.sparkle.visible) {
        const k = (t - 4.95) / 0.55;
        this.sparkle.position.set(glass.position.x, counterY + glass.lip + 0.01, glass.position.z);
        this.sparkle.scale.setScalar(1 + k * 3);
        this.sparkle.material.opacity = 1 - k;
      }

      // 5.3 - 6.0  He slides it across the marble to you...   6.0 - 6.6  ...and bows.
      leftArm = lerp(leftArm, -1.15, span(t, 5.2, 5.4) * (1 - span(t, 6.0, 6.2)));
      once('slide', 5.35, playGlassDown);
      bow += Math.sin(span(t, 5.9, 6.6) * Math.PI) * 0.45;
      rightArm = lerp(rightArm, -0.9, span(t, 5.9, 6.1) * (1 - span(t, 6.4, 6.6)));   // one hand across his chest

      this.toolAt.copy(tool.position);
      if (t >= MAKE_TIME) {
        this.show = null;
        for (const thing of [this.shaker, this.bottle, this.stream, this.cork, this.sparkle]) thing.visible = false;
        show.done();
      }
    }

    b.rotation.set(bow, -Math.PI / 2 + turn, 0);
    right.rotation.x = rightArm;
    left.rotation.x = leftArm;
  }
}
