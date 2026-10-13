// The bar: who tends it (a woman in a dark suit, a towel over her arm: `barman` throughout, as the job is called
// in the code), and the drinks she makes.
//
// Sit on a stool and order, and she puts on a show: comes down the bar, goes under it for what she needs and comes up
// in your face with it, shakes it or spins the bottle, tosses it in the air and catches it, sets a glass down, pours,
// drops in a garnish, slides the glass across the marble and bows.
// Then the drink is yours to drink (room.js lifts it to Kirky's mouth).
//
// It is filmed like a cooking cut-in from an arcade game: hard cuts between
// close-ups, snap zooms, speed lines, slow motion on the toss, a flash on the
// catch. shot() says where the camera should be at each moment; room.js puts it there.
//
// room.js owns the room; this file owns everything behind the counter.
import * as THREE from 'three';
import { loadModel } from '../models.js';
import { playShake, playPour, playClink, playCork, playGlassDown } from '../fx/audio.js';

export const DRINKS = [
  { id: 'whisky', name: 'Whisky', price: 10, liquid: 0xc9792a, tool: 'bottle', bottle: 0x5a3414 },
  { id: 'martini', name: 'Dry Martini', price: 20, liquid: 0xe6f0c4, tool: 'shaker' },
  { id: 'champagne', name: 'Champagne', price: 40, liquid: 0xf2d27a, tool: 'bottle', bottle: 0x1f4a2a, cork: true },
];

// She works by one long clip of a barman at work (`bartend`, in public/models/barman.glb: tools/build_staff.py), and
// whatever she is doing is a stretch of it. With nothing to do she stands at ease (two more clips: `idle`, breathing,
// and `shift`, her weight going from one foot to the other), and finds herself something every so often: CHORES. The show, cut to cut with the camera: [from, to (seconds of the show), the
// frame of the clip it starts on, the frame it ends on]. (The clip, for whoever changes these: 1-25 stood, his hands
// on the bar. 37-61 down under it. 61-97 up, and something set down in front of him. 109-133 a bottle fetched from
// his right. 133-163 poured. 169-205 put back, and down on his left. 217-250 both hands up by his shoulder. 253-277
// poured again. 283-295 his hands together in front of him. 337-361 pushed across the bar. 361-408 stood again.)
const SHOW = [
  [0.0, 0.5, 4, 25],        // coming down the bar
  [0.5, 0.95, 25, 58],      // down under it for what he needs
  [0.95, 1.4, 58, 80],      // and up with it, into your face
  [1.4, 2.35, 0, 0],        // at work (see WORK: it depends what with)
  [2.35, 3.0, 133, 146],    // the toss
  [3.0, 3.4, 343, 356],     // a glass, set down
  [3.4, 4.95, 139, 162],    // the pour
  [4.95, 5.35, 281, 293],   // the garnish
  [5.35, 6.05, 337, 361],   // slid across to you
  [6.05, 6.9, 361, 394],    // and back, with a bow
];
// What she finds to do, with nobody to serve: [the frame of `bartend` it starts on, the frame it ends on, how long she
// takes over it (seconds), there and back (true) or straight through].
const CHORES = {
  wipe: [337, 372, 2.0, true],     // a wipe of the bar: both hands out across it, and back
  under: [28, 72, 1.9, false],     // a look under it for something
  polish: [283, 293, 3.0, true],   // a glass, polished: her hands together in front of her (a glass in them: see update)
  tidy: [109, 133, 2.4, true],     // a bottle straightened, off to her right
};
const WORK = { shaker: [224, 236], bottle: [212, 232] };   // (the shaker: up by her shoulder, going like the clappers; the bottle: brought up there, spinning by its neck)
const TALL = 1.18;       // how much bigger than life she is: her hands come to the top of this bar, and she can be seen over it
const REACH = 0.7;       // how far in front of him the middle of the clip is: where his glass goes
const MAKE_TIME = 6.9;   // seconds for the whole performance (on its own clock: the toss runs in slow motion)
export const SERVED = -0.14;     // a served drink: this far along the bar from in front of whoever it is for (by their left hand: the one they drink with)
export const GLASS_SIZE = 1.6;   // glasses are drawn larger than life so you can see what you're getting
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const span = (t, from, to) => smooth((t - from) / (to - from));   // 0 before `from`, easing to 1 at `to`
const lerp = (a, b, t) => a + (b - a) * t;
const v = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion();

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

    // ---- The barman ----
    // The clip she moves by was made stood at a bar: the middle of it is where her glass goes, and its top is as high
    // as this one's. So `barman` (what she is in) is put where the glass goes, turned to face the room, and she stands
    // behind that. Her head, her back, and the towel over her arm are turned on top of the clip: see pose().
    const b = (this.barman = new THREE.Group());
    b.rotation.y = -Math.PI / 2;
    b.position.set(backX - REACH, 0, homeZ);
    b.scale.setScalar(TALL);
    this.bones = null;
    this.headAt = new THREE.Vector3(backX, 1.6, homeZ);   // where her face is (for whoever points a camera at it)
    this.frame = 1;
    this.fading = 0;
    this.ease = 1;            // 0..1: how far she is stood at ease, not at a frame of her work
    this.chore = null;        // what she has found to do: { kind, t }
    this.nextChore = 5;       // seconds until she finds something
    // (the glass she polishes: in her hand while she does)
    this.polished = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.09, 12, 1, true), this.mats.glass);
    this.polished.visible = false;
    scene.add(this.polished);
    loadModel('barman.glb').then((gltf) => {
      const body = gltf.scene;
      body.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;   // (her box is where she stood to be made, not where the clip has her)
        if (o.material.transparent) Object.assign(o.material, { transparent: false, alphaTest: 0.45, depthWrite: true, side: THREE.DoubleSide });   // (her hair and lashes: cut out, not blended: they sort themselves that way)
      });
      b.add(body);
      this.mixer = new THREE.AnimationMixer(body);
      // (two of the one clip: what she is doing, and what she was doing a moment ago, fading out under it)
      const named = (name) => gltf.animations.find((clip) => clip.name === name);
      this.decks = [named('bartend'), named('bartend').clone()].map((clip) => { const action = this.mixer.clipAction(clip); action.play(); action.paused = true; return action; });
      // (and stood at ease: these two run by themselves, round and round, under whatever she is doing)
      this.atEase = ['idle', 'shift'].map((name) => { const action = this.mixer.clipAction(named(name)); action.play(); action.setEffectiveWeight(0); return action; });
      const bone = (name) => { let found = null; body.traverse((o) => { if (!found && o.isBone && o.name.endsWith(name) && /^mixamorig\d*$/.test(o.name.slice(0, -name.length))) found = o; }); return found; };   // (Mixamo's bones: `mixamorig`, or that and a number, then what it is)
      this.bones = { head: bone('Head'), neck: bone('Neck'), spine: bone('Spine'), chest: bone('Spine2'), right: bone('RightHand'), foreR: bone('RightForeArm'), armR: bone('RightArm'), armL: bone('LeftArm'), foreL: bone('LeftForeArm') };
    }).catch((error) => console.warn('The bar: nobody to tend it.', error));
    const white = std(0xf3f0e8, 0.7, { side: THREE.DoubleSide });
    // A towel over her left forearm. (It goes where that bone has got to, every frame: see dress().)
    this.towel = new THREE.Group();
    add(new THREE.BoxGeometry(0.095, 0.012, 0.1), white, 0, 0.045, 0, this.towel);                 // (over the top of her arm...)
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.095, 0.19, 0.012), white, 0, -0.05, side * 0.05, this.towel);   // (...and hanging either side of it)
    this.towel.visible = false;
    scene.add(this.towel);

    // What she works with: a shaker and a bottle (one shown at a time, in his right hand), and the stream as he pours.
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
    this.tools = [this.shaker, this.bottle];
    this.stream = add(new THREE.CylinderGeometry(0.006, 0.006, 1, 6).translate(0, -0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 0, 0, 0, scene);
    this.cork = add(new THREE.CylinderGeometry(0.012, 0.014, 0.03, 8), std(0xc9a26a, 0.9), 0, 0, 0, scene);
    this.sparkle = add(new THREE.RingGeometry(0.05, 0.07, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, toneMapped: false }), 0, 0, 0, scene);
    for (const thing of [this.shaker, this.bottle]) scene.add(thing);
    scene.add(b);
    this.grip = new THREE.Vector3(backX - 0.4, counterY + 0.25, homeZ);   // where his right hand has got to (what he is working with is in it)

    this.toolAt = new THREE.Vector3();   // where the shaker or bottle is (for the camera)
    this.time = 0;
    this.show = null;   // the performance in progress: { t, drink, glass, z, done }
    this.reset();
  }

  reset() {
    this.show = null;
    this.scolding = 0;
    this.alarmed = 0;
    this.barman.position.z = this.at.homeZ;
    for (const thing of [this.shaker, this.bottle, this.stream, this.cork, this.sparkle]) thing.visible = false;
  }

  get busy() { return this.show !== null; }

  // The customer at depth z is about to be sick: react, for `seconds`.
  alarm(z, seconds) { this.alarmed = this.alarmLength = seconds; this.alarmZ = z; }

  // Come and disapprove of the customer at depth z, for a moment.
  scold(z) { this.scolding = 1.5; this.scoldZ = z; }

  // The camera's part in the performance: where it is, what it looks at and how far it's zoomed,
  // cut by cut, plus the effects on top (lines: speed lines, flash: a white pop, title: big text).
  // Returns null when nothing is being made.
  shot() {
    const show = this.show;
    if (!show) return null;
    const t = show.t, z = show.z, { counterY, serveX, backX } = this.at, g = show.glass.position, tool = this.toolAt;
    const head = this.headAt.y + 0.04, at = (x, y, dz) => new THREE.Vector3(x, y, z + dz), face = this.headAt;
    const pop = (when) => (t >= when ? Math.exp(-(t - when) * 7) : 0);
    const flash = Math.max(pop(2.98), pop(4.95), pop(6.05) * 0.8);
    let s;
    if (t < 0.95) s = { pos: at(backX - 4.0, 2.2, 2.9), look: at(backX - 0.7, 1.45, -0.6), fov: 56 - 8 * span(t, 0, 0.95) };                    // wide: he comes down the bar
    else if (t < 1.4) s = { pos: at(backX - 2.25, 1.62, 0.42), look: face.clone().setY(face.y * 0.6 + 0.66), fov: 46 - 22 * span(t, 0.95, 1.12), lines: 1 };       // snap zoom: up he comes, into your face
    else if (t < 2.35) s = { pos: at(backX - 1.35, head - 0.1, 1.0), look: tool.clone().lerp(face, 0.5), fov: 38, shake: 0.012, lines: 0.6 };                      // tight on his hands at work
    else if (t < 3.0) s = { pos: at(backX - 1.5, counterY + 0.12, 0.6), look: tool.clone().lerp(face, 0.3), fov: 46 };         // from below: the toss, in slow motion
    else if (t < 3.4) s = { pos: at(g.x - 0.3, counterY + 0.55, 0.42), look: g.clone().setY(counterY + 0.08), fov: 30 };                       // the glass goes down
    else if (t < 4.95) s = { pos: at(g.x - 0.8 + 0.12 * span(t, 3.4, 4.9), counterY + show.glass.lip * 0.9, 0.62), look: g.clone().setY(counterY + show.glass.lip * 0.62), fov: 30 - 6 * span(t, 3.6, 4.8) };   // counter level: the pour
    else if (t < 5.35) s = { pos: at(g.x - 0.55, counterY + show.glass.lip + 0.3, 0.5), look: g.clone().setY(counterY + show.glass.lip * 0.8), fov: 26, lines: 0.5 };   // the garnish
    else if (t < 6.05) s = { pos: new THREE.Vector3(g.x - 0.12, counterY + 0.1, g.z + 0.62), look: g.clone().setY(counterY + 0.12), fov: 34 };    // travelling with the glass down the marble
    else s = { pos: at(serveX - 0.6, counterY + 0.24, 0.38 + SERVED), look: at(backX - 0.5, counterY + 0.32, -0.42 + SERVED), fov: 42 - 6 * span(t, 6.05, 6.9), title: show.drink.name };   // your drink, and his bow behind it
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
      g.lip = 0.11; g.rim = 0.05; g.grip = [0.06, 0.047];
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
      g.lip = 0.175; g.rim = 0.072; g.grip = [0.062, 0.006];
    } else {
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.006, 14), mats.glass, 0, 0.003, 0, g);
      add(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 6), mats.glass, 0, 0.05, 0, g);
      add(new THREE.CylinderGeometry(0.03, 0.016, 0.15, 14, 1, true), mats.glass, 0, 0.17, 0, g);
      g.liquid = fill(new THREE.CylinderGeometry(0.027, 0.015, 0.125, 14).translate(0, 0.0625, 0), 0.097);
      g.garnish = add(new THREE.SphereGeometry(0.017, 8, 6).scale(1, 1.2, 1), new THREE.MeshStandardMaterial({ color: 0xc8201b, roughness: 0.5 }), 0.03, 0.245, 0, g);   // a strawberry on the rim
      g.lip = 0.245; g.rim = 0.03; g.grip = [0.055, 0.006];
    }
    g.garnish.visible = false;
    g.drink = drink;
    g.level = 0;
    g.lip *= GLASS_SIZE;   // (lip: how high its rim is. rim: how wide, from its middle. grip: how high a hand takes hold of it, and how far from its middle)
    g.rim *= GLASS_SIZE;
    g.grip = g.grip.map((n) => n * GLASS_SIZE);
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
    const b = this.barman, { counterY, serveX, backX, homeZ } = this.at;
    const show = this.show;
    this.fading = Math.max(0, this.fading - dt);

    // At rest: at her post, stood at ease, looking up and down the bar; and every so often something to do (CHORES).
    let frame = this.frame, fade = 0.3, bow = 0, turn = Math.sin(this.time * 0.5) * 0.3 + 0.2 * Math.sin(this.time * 0.19 + 1), tilt = 0, ease = 1;
    const idling = !show && !(this.alarmed > 0) && !(this.scolding > 0);
    if (!idling) this.chore = null;
    else if (this.chore) {
      const C = CHORES[this.chore.kind], k = (this.chore.t += dt) / C[2];
      if (k >= 1) { this.chore = null; this.nextChore = 6 + Math.random() * 7; }
      else if (this.chore.t > 0.3) {   // (she has stopped standing about, by then)
        const through = (this.chore.t - 0.3) / (C[2] - 0.3), there = C[3] ? (this.chore.kind === 'polish' ? 0.5 + 0.5 * Math.sin(through * 22) : Math.sin(through * Math.PI)) : through;
        frame = lerp(C[0], C[1], there);
        fade = 0;
      }
      ease = this.chore && this.chore.t < C[2] - 0.35 ? 0 : 1;
    } else if ((this.nextChore -= dt) <= 0) {
      const kinds = Object.keys(CHORES);
      this.chore = { kind: kinds[Math.floor(Math.random() * kinds.length)], t: 0 };
      this.frame = frame = CHORES[this.chore.kind][0];
    }
    this.polished.visible = !!this.chore && this.chore.kind === 'polish' && this.ease < 0.4;
    if (this.polished.visible) this.polished.position.copy(this.grip);
    if (!show) {
      b.position.y = 0;
      if (this.alarmed > 0) {
        // Someone is about to be sick on his bar. He is down behind it in a flash; up again to shove a bucket at them;
        // and then he can't watch.
        const e = this.alarmLength - (this.alarmed -= dt);
        b.position.z = lerp(b.position.z, this.alarmZ, 1 - Math.exp(-12 * dt));
        turn = 0;
        if (e < 1.0) { frame = lerp(40, 56, span(e, 0, 0.3)) + Math.sin(this.time * 30) * 1.2; fade = 0.12; }
        else if (e < 2.8) { frame = lerp(337, 359, span(e, 1.0, 1.45)); fade = 0.15; }
        else { frame = 229; turn = 1.5 * span(e, 2.8, 3.0); tilt = 0.25; }   // turned away, a hand up between her and it
        ease = 0;
      } else if (this.scolding > 0) {
        // A customer has had enough: he comes over, shakes his head and wags a claw.
        this.scolding -= dt;
        b.position.z = lerp(b.position.z, this.scoldZ, 1 - Math.exp(-9 * dt));
        turn = Math.sin(this.time * 13) * 0.4;
        frame = 131 + Math.sin(this.time * 16) * 3;
        fade = 0.2;
        ease = 0;
      } else b.position.z = lerp(b.position.z, homeZ, 1 - Math.exp(-2 * dt));
      this.ease = lerp(this.ease, ease, 1 - Math.exp(-(ease ? 4 : 9) * dt));
      this.pose(frame, fade, bow, turn, tilt, null, 0, dt);
    } else {
      const t = (show.t += dt * (show.t > 2.35 && show.t < 2.95 ? 0.35 : 1)), { drink, glass } = show,   // (the toss hangs in the air)
      tool = drink.tool === 'shaker' ? this.shaker : this.bottle;
      const once = (name, at, run) => { if (t >= at && !show.marks[name]) { show.marks[name] = true; run(); } };

      // He comes down the bar to you; every cut after that is a stretch of his clip (SHOW), and the cut hides the join.
      b.position.z = lerp(b.position.z, show.z, 1 - Math.exp(-5 * dt));
      b.position.y = Math.abs(Math.sin(this.time * 9)) * 0.02 * (1 - span(t, 0.3, 0.6));
      const cut = SHOW.find((c) => t < c[1]) || SHOW[SHOW.length - 1], shaking = t > 1.4 && t < 2.3 ? 1 : 0, wobble = Math.sin(this.time * 34) * shaking;
      const [from, to] = cut[2] ? [cut[2], cut[3]] : WORK[drink.tool] || WORK.bottle;
      frame = lerp(from, to, drink.tool === 'shaker' && !cut[2] ? 0.5 + 0.5 * wobble : span(t, cut[0], cut[1]));
      bow = Math.sin(span(t, 6.0, 6.75) * Math.PI) * 0.5;
      // 3.4 - 4.8  She tips it over the glass and pours: from her side of it, and from as high over its rim as it takes
      // (her hand is put there: the clip pours into a glass the size glasses are, and these are bigger).
      const pouring = span(t, 3.3, 3.6) * (1 - span(t, 4.7, 4.95));
      const glassAt = v3.set(backX - REACH, counterY, show.z);
      // (and she stands up to it, her eyes on the glass, not bent under her own arm)
      this.ease = lerp(this.ease, 0, 1 - Math.exp(-9 * dt));   // (to work)
      this.pose(frame, cut === SHOW[0] ? 0.25 : 0, bow - 0.32 * pouring, 0, -0.22 * pouring, pouring > 0 ? v.set(glassAt.x + 0.36, counterY + glass.lip + 0.13, glassAt.z - 0.03) : null, pouring, dt);

      // What he is working with is in his right hand: the shaker going over his shoulder, or the bottle spun by its
      // neck; then up in the air and back into his grip.
      const working = span(t, 0.95, 1.0) * (1 - span(t, 5.3, 5.6));
      tool.visible = working > 0.02;
      if (shaking && this.time - show.shaken > 0.11) { show.shaken = this.time; playShake(); }
      const toss = t > 2.3 && t < 3.0 ? (t - 2.3) / 0.7 : -1;   // 0..1 while it's in the air
      tool.position.copy(this.grip);
      tool.rotation.set(0, 0, 0);
      tool.scale.setScalar(1.35);
      if (shaking) tool.position.y += wobble * 0.05;
      if (drink.tool === 'bottle' && t > 1.4 && t < 2.3) tool.rotation.z = (t - 1.4) * 14;   // twirling it by the neck
      if (toss >= 0) {
        tool.position.y += Math.sin(toss * Math.PI) * 0.75;
        tool.rotation.x = toss * Math.PI * 4;   // two full turns
        once('caught', 2.98, playClink);
      }

      // 2.9 - 3.3  A glass, set down in front of him with his other hand.
      once('glass', 3.0, () => { glass.visible = true; playGlassDown(); });
      const serve = span(t, 5.3, 6.0);
      glass.position.set(lerp(glassAt.x, serveX, serve), counterY + Math.max(0, 0.25 - (t - 3.0) * 1.6), show.z + lerp(0, SERVED, serve));
      glass.scale.setScalar(GLASS_SIZE * Math.min(1, Math.max(0.01, (t - 3.0) * 6)));

      // The pour: the tool tips, a thread of drink runs down into the glass, and the glass fills.
      tool.rotation.z += 1.78 * pouring;   // (over, away from her)
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
        tool.position.y += Math.max(0, counterY + glass.lip + 0.05 - mouth.y);
        tool.position.z += (glassAt.z - mouth.z) * 0.9;
        this.stream.position.copy(tool.localToWorld(v.set(0, 0.2, 0)));
        this.stream.scale.y = Math.max(0.02, this.stream.position.y - (counterY + 0.03));
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
      once('slide', 5.35, playGlassDown);

      this.toolAt.copy(tool.position);
      if (t >= MAKE_TIME) {
        this.show = null;
        for (const thing of [this.shaker, this.bottle, this.stream, this.cork, this.sparkle]) thing.visible = false;
        show.done();
      }
    }
  }

  // Put her at `frame` of her work (`fade`: seconds to ease into it, if it is not where she was: 0 across a cut), as far
  // as she is not stood at ease (this.ease: her two clips for that run on by themselves, `dt` at a time, her weight
  // shifting every so often); and on top of that: bowed (her back bent that far), her head turned (to look down the
  // bar, to shake it) and tipped.
  pose(frame, fade, bow, turn, tilt, reach = null, reaching = 0, dt = 0) {
    if (!this.bones) return;
    const [now, was] = this.decks, B = this.bones;
    if (Math.abs(frame - this.frame) > 5) { was.time = now.time; this.fading = this.faded = fade; }
    this.frame = frame;
    now.time = Math.max(0, Math.min(now.getClip().duration - 0.01, (frame - 1) / 30));
    const old = this.fading > 0 ? smooth(this.fading / this.faded) : 0, ease = smooth(this.ease), shifting = smooth((Math.sin(this.time * 0.37) - 0.35) / 0.3);
    now.setEffectiveWeight((1 - old) * (1 - ease));
    was.setEffectiveWeight(old * (1 - ease));
    this.atEase[0].setEffectiveWeight(ease * (1 - shifting));
    this.atEase[1].setEffectiveWeight(ease * shifting);
    this.mixer.update(dt);
    B.spine.rotateX(bow * 0.55);
    B.chest.rotateX(bow * 0.45);
    B.neck.rotateY(turn * 0.4);
    B.head.rotateY(turn * 0.6);
    B.head.rotateX(tilt);
    this.barman.updateMatrixWorld(true);
    if (reach && reaching > 0.001) this.reach(reach, reaching);
    this.dress();
  }

  // Her right hand (its wrist) to `to`, in the world, `w` of the way there from where the clip has it: her shoulder,
  // her elbow (below the line between them, and out to that side), her wrist.
  reach(to, w) {
    const B = this.bones;
    const point = (bone, child, at) => {   // turn `bone` (the least it takes) so that `child` lies towards `at`
      bone.getWorldPosition(v2); child.getWorldPosition(v4);
      q.setFromUnitVectors(v4.sub(v2).normalize(), v5.copy(at).sub(v2).normalize());
      bone.getWorldQuaternion(q2).premultiply(q);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(q).invert().multiply(q2));
      bone.updateMatrixWorld(true);
    };
    const S = B.armR.getWorldPosition(new THREE.Vector3()), E = B.foreR.getWorldPosition(new THREE.Vector3()), H = B.right.getWorldPosition(new THREE.Vector3());
    const L1 = S.distanceTo(E), L2 = E.distanceTo(H), T = H.lerp(to, smooth(w));
    const far = Math.min(S.distanceTo(T), (L1 + L2) * 0.995), along = (L1 * L1 - L2 * L2 + far * far) / (2 * far), off = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const dir = T.clone().sub(S).normalize(), pole = new THREE.Vector3(0, -1, 0).addScaledVector(S.clone().sub(B.armL.getWorldPosition(v2)).normalize(), 0.7);
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    point(B.armR, B.foreR, E.copy(S).addScaledVector(dir, along).addScaledVector(pole, off));
    point(B.foreR, B.right, T);
  }

  // Her towel, and where her hand and her face are, from where her bones have got to.
  dress() {
    const B = this.bones, at = (bone, x, y, z, out) => out.set(x, y, z).applyQuaternion(bone.getWorldQuaternion(q)).add(bone.getWorldPosition(v2));
    at(B.right, 0, 0.085, 0.03, this.grip);      // (in her palm: her fingers run along +y)
    at(B.head, 0, 0.08, 0.06, this.headAt);      // (the middle of her face)
    this.towel.visible = true;
    at(B.foreL, 0, 0.13, 0, this.towel.position);   // (halfway down her forearm, which runs along +y)
    this.towel.quaternion.copy(q).multiply(q2.setFromAxisAngle(v2.set(0, 0, 1), Math.PI / 2));   // (across it, not along it)
  }
}
