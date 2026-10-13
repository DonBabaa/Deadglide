// Cutscenes: short moments where the game stops and the camera goes somewhere
// else. While one plays, main.js runs nothing but cutscenes.update().
//   boss()    the final boss claws his way out of the ground
//   portal()  the boss dies, then the exit portal tears open
//   exit()    Kirky is pulled through it
// Each is a function of time: `step(t, dt)` places the camera and moves the
// few things that are allowed to move, and `done` runs when it's over.
import * as THREE from 'three';
import { heightAt } from './world/terrain.js';
import { HOUSE, WALL_TOP } from './world/house.js';
import { hud } from './ui/hud.js';
import { ENEMY_TYPES } from './enemies/types.js';
import { FLIGHT } from './systems/descent.js';
import { SkaterModel, SNAPPED_END } from './player/skaterModel.js';
import { realGuns } from './player/gunModels.js';
import { playNext, playWind, playBell, playCrow, playInhale, playExhale, playChipFlip, playChipLand, playDrips, playCaveAir, playHatch, playLadder, playManhole, playCity, playReveal, playPushOff, playDoorsBurst, playChandelier, playShuffle, playReelsStop, playCoinsPour, playFloorCrack, playCreak, playGlass, playDustWave, playGhosts, playBuried, playHush, playMoonLand, playSnap, playEndChord, playCredit, playFanfare, playTitleSting, playLaugh } from './fx/audio.js';
import { playBones, playDread, playThunder, playHeadshot, playPowerup, playBossIntro, playPortalOpen, playExit, playBossBurst, playBossPop, playRumble, playWhoosh, playLighter, playCoin } from './fx/audio.js';
import { setMusicStyle } from './fx/music.js';
import { holdMusic, sceneBoost } from './fx/audio.js';
import { playCue, stopCue } from './fx/score.js';

const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const UP = new THREE.Vector3(0, 1, 0);
const NEXT = 'Enter: next  ·  Tab: skip the scene';   // (under every line of story)
const eye = new THREE.Vector3(), target = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3(), centre = new THREE.Vector3();
const spin = new THREE.Quaternion();

// skipStory(): true when the player has switched the story scenes off (they are skipped as they start).
export function createCutscenes({ camera, model, skater, horde, portal, renderPos, skipStory = () => false }) {
  let scene = null;   // the one playing: { time, duration, step, done, marks }
  const home = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 0 };   // where the camera was

  // A light the camera can carry, for scenes shot somewhere dark (the Catacombs). Off unless a scene turns it on.
  const lamp = new THREE.PointLight(0xd8ffd0, 0, 70, 1.4);
  model.root.parent.add(lamp);
  // Things a scene brings with it (the prologue's chip and hole). Hidden whenever nothing is playing.
  const stage = new THREE.Group();
  stage.visible = false;
  model.root.parent.add(stage);

  // The things the story scenes bring with them: the casino chip, and (for the way down to the House) the hole in
  // the floor and the light coming up through it. Made the first time they are wanted.
  function props() {
    if (!stage.userData.chip) {
      const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), g = c.getContext('2d');
      g.fillStyle = '#ffc233'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
      g.strokeStyle = '#7a1420'; g.lineWidth = 16; g.setLineDash([26, 22]); g.beginPath(); g.arc(128, 128, 108, 0, 7); g.stroke();
      g.setLineDash([]); g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 84, 0, 7); g.stroke();
      g.fillStyle = '#7a1420'; g.font = '86px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B.G.', 128, 136);
      const face = new THREE.CanvasTexture(c);
      face.colorSpace = THREE.SRGBColorSpace;
      const gold = new THREE.MeshBasicMaterial({ color: 0xd9a52a, toneMapped: false }), top = new THREE.MeshBasicMaterial({ map: face, toneMapped: false });
      const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 28), [gold, top, top]);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      const rim = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc233, toneMapped: false }));
      const glow = new THREE.PointLight(0xffc860, 0, 40, 1.4);
      const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), gold, 90);   // (the house's takings, for the scene after Babitus dies)
      coins.frustumCulled = false;
      // The way out of the Catacombs: a ladder, the round of street light at the top of it, and the manhole's lid.
      const iron = new THREE.MeshBasicMaterial({ color: 0x3a3d42 }), ladder = new THREE.Group();
      for (const x of [-0.22, 0.22]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 10, 0.06), iron); rail.position.set(0, 5, x); ladder.add(rail); }
      for (let y = 0.4; y < 10; y += 0.4) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.44), iron); rung.position.y = y; ladder.add(rung); }
      const shaft = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, toneMapped: false, fog: false }));
      const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.09, 22), new THREE.MeshBasicMaterial({ color: 0x4a4d52 }));
      // What you get for finishing: the gold broken cigarette, big enough to hold up; rays of light behind it; sparks.
      const prize = new THREE.Group(), shine = new THREE.MeshBasicMaterial({ color: 0xffc233, toneMapped: false }), butt = new THREE.MeshBasicMaterial({ color: 0xb8860b, toneMapped: false });
      const stick = (len, material, tip) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, len, 14).rotateZ(Math.PI / 2), material); m.position.x = tip; return m; };
      const hang = new THREE.Group();
      hang.position.x = 0.35;
      hang.rotation.z = -0.75;
      hang.add(stick(0.55, shine, 0.275));
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false }));
      tip.position.x = 0.56;
      hang.add(tip);
      prize.add(stick(0.4, butt, -0.5), stick(0.65, shine, 0.025), hang);
      // (That is the built one. The boof he ends up wearing is modelled (public/models/guns.glb), and when it arrives
      // it takes the built one's place here: the same thing, eleven times the size, lying along the same line, its
      // snapped half turned up and its ember sitting on the end of that.)
      realGuns().then((guns) => {
        const turned = new THREE.Group(), real = new THREE.Group();
        const gilt = (color, glow) => new THREE.MeshStandardMaterial({ color, emissive: glow, roughness: 0.32, metalness: 0.55 });
        const finish = { Paper: gilt(0xffc233, 0x8a5a00), Crutch: gilt(0xb8860b, 0x5a3c00) };
        guns?.traverse((o) => { const is = o.isMesh && o.name.match(/^boofbroken_(Paper|Crutch)/); if (is) turned.add(new THREE.Mesh(o.geometry, finish[is[1]])); });
        if (!turned.children.length) return;
        tip.geometry = new THREE.SphereGeometry(0.0128, 12, 10);
        tip.position.copy(SNAPPED_END);
        turned.add(tip);
        turned.scale.setScalar(11);
        turned.position.z = -0.054 * 11;     // (its middle on the middle of the prize)
        real.rotation.y = Math.PI / 2;       // (and along the prize's length)
        real.add(turned);
        prize.clear();
        prize.add(real);
      });
      const rays = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, map: (() => {
        const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 512 }), g2 = cv.getContext('2d');
        g2.translate(256, 256);
        for (let i = 0; i < 18; i++) { g2.rotate((Math.PI * 2) / 18); const fade = g2.createLinearGradient(0, 0, 256, 0); fade.addColorStop(0, 'rgba(255,210,90,0.85)'); fade.addColorStop(1, 'rgba(255,210,90,0)'); g2.fillStyle = fade; g2.beginPath(); g2.moveTo(0, 0); g2.lineTo(256, -22); g2.lineTo(256, 22); g2.fill(); }
        const t2 = new THREE.CanvasTexture(cv); t2.colorSpace = THREE.SRGBColorSpace; return t2;
      })() }));
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0x07080c, fog: false }));
      const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(120 * 3), 3)), new THREE.PointsMaterial({ color: 0xffe6a0, size: 0.09, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      sparks.frustumCulled = false;
      stage.add(chip, hole, rim, glow, coins, ladder, shaft, cover, prize, rays, dark, sparks);
      Object.assign(stage.userData, { chip, hole, rim, glow, coins, ladder, shaft, cover, prize, rays, dark, sparks });
    }
    const made = stage.userData;
    made.chip.visible = made.hole.visible = made.rim.visible = made.coins.visible = made.ladder.visible = made.shaft.visible = made.cover.visible = made.prize.visible = made.rays.visible = made.dark.visible = made.sparks.visible = false;
    made.glow.color.set(0xffc860);
    made.glow.intensity = 0;
    return made;
  }

  // The ending's cast: Kirky, and one more of him for every costume there is. Made the first time they are wanted.
  const cast = { kirky: null, others: [] };

  function begin(duration, step, done) {
    home.position.copy(camera.position);
    home.quaternion.copy(camera.quaternion);
    home.fov = camera.fov;
    scene = { time: 0, duration, step, done, marks: {}, holds: [], waiting: false };   // holds: see next()
    document.body.classList.add('cutscene');
    holdMusic(0.14);   // (the level's music steps back for as long as a scene is up)
  }

  function finish(completed) {
    const { done, cleanup } = scene;
    scene = null;
    cleanup?.();   // (a scene that brought its own actors puts them away)
    lamp.intensity = 0;
    lamp.color.set(0xd8ffd0);
    stage.visible = false;
    hud.caption(null);
    document.body.classList.remove('cutscene', 'cut-wait');
    hud.flash(null);
    hud.dread(0);
    hud.lines(0);
    model.root.scale.setScalar(1);
    if (horde.boss) { horde.boss.rise = 1; horde.boss.roar = 0; horde.boss.posed = false; }
    horde.corpse = null;
    if (completed) done?.();
    if (!scene) { stopCue(); holdMusic(null); sceneBoost(1); }   // (unless what followed was another scene)
  }
  // A story scene's own music (fx/score.js): the level's music goes right down under it.
  function score(name) {
    holdMusic(0.02);
    sceneBoost(2);   // (and what happens in it is twice as loud)
    playCue(name);
  }

  // Put the camera at `eye` looking at `target`, shaking by up to `shake` metres.
  // (A shot that is on Kirky's face, or on what is in his mouth, is put on his face as it is: every scene here aims
  // at where a man's head would be over his board, and stands as close as suits a man's head. His is bigger, and is
  // where his body has it. So the shot is centred on the middle of his face, and stood off further by as much as his
  // head is bigger: the nearer it was, the more.)
  const faceNow = new THREE.Vector3(), lipsNow = new THREE.Vector3();
  function onFace() {
    for (const who of [model, cast.kirky]) {
      if (!who || !who.faceAt || !who.root.visible || !who.body || !who.body.visible) continue;
      who.faceAt(faceNow);
      const far = eye.distanceTo(target);
      if (far > 3.4 || target.distanceTo(faceNow) > 0.55) continue;
      const lips = target.distanceTo(who.ember.getWorldPosition(lipsNow)) < 0.12;      // (on his boof: it stays on it)
      const back = 1 + (who.faceBig - 1) * 0.72 * (lips ? 0.6 : 1) * (1 - smooth((far - 1.6) / 1.8));
      dir.copy(eye).sub(target);
      if (!lips) {
        target.copy(faceNow);
        if (far < 1) target.lerp(who.cig.getWorldPosition(lipsNow), 0.6);   // (right in on him: that is a shot of his mouth, and what is in it)
      }
      eye.copy(target).addScaledVector(dir, back);
      return;
    }
  }
  function view(fov, shake = 0) {
    onFace();
    camera.position.copy(eye);
    if (shake) camera.position.add(dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake * 2));
    camera.lookAt(target);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  function goHome() {
    camera.position.copy(home.position);
    camera.quaternion.copy(home.quaternion);
    camera.fov = home.fov;
    camera.updateProjectionMatrix();
  }
  // A line of story over a scene that has none of its own: it comes up at `at`, and the scene waits at `hold` until it has been read.
  // How Kirky takes a line of the story: what his face does. Read off the words (a scene can also call
  // model.express itself, for a beat that has no line).
  const MOODS = [
    [/\?|what|who|wait|huh|why/i, 'surprise', 1.6], [/boof|smoke|light|gold|chip|win|jackpot|free|home|nice|yes/i, 'smile', 2.2],
    [/dead|die|lost|lose|gone|buried|broke|no|never|alone|last/i, 'sad', 2.4], [/owes|owe|take it back|mine|kill|run|pay|house/i, 'angry', 2.0], [/moon|sky|stars|far|down/i, 'ooh', 1.8],
  ];
  function reaction(text) {
    const mood = MOODS.find(([words]) => words.test(text));
    for (const who of [model, cast.kirky].filter(Boolean)) {
      who.talk?.(Math.min(2.6, 0.5 + text.length * 0.045));
      if (mood) who.express?.(mood[1], mood[2], 0.9);
    }
  }
  function say(at, hold, text) {
    const step = scene.step;
    // (when a line comes up, whoever is on screen as Kirky reacts to it: see reaction())
    let shown = false;
    scene.step = (t, dt) => { step(t, dt); hud.caption(t >= at ? text : null, NEXT); if (t >= at && !shown) { shown = true; reaction(text); } else if (t < at) shown = false; };
    scene.holds.push(hold);
    scene.auto = 2.5;
  }
  // The way Kirky's face is pointing (not the way his board is: he stands side-on to that). Fills and returns `out`.
  const brow = new THREE.Vector3();
  function facing(out) {
    model.root.updateMatrixWorld(true);
    model.torso.localToWorld(brow.set(0, 0.8, 0));
    return model.ember.getWorldPosition(out).sub(brow).setY(0).normalize();
  }
  // Run `fn` once, the first time the cutscene's clock passes `at`.
  const once = (name, t, at, fn) => { if (t >= at && !scene.marks[name]) { scene.marks[name] = true; fn(); } };
  // Kirky off his board, in a scene: stood at `at` facing `yaw` (0: the way the world's z runs), doing clip `name` of
  // his motion capture (`time` seconds into it, if given: a climb is kept in step with how far he has climbed, a
  // fall with how long he has been falling). His gun is put away. His board is slung on his back (sling: false
  // leaves it where it is, under him). The scene's own cleanup puts all of it back; aboard() does it sooner, for a
  // scene that has him ride again.
  function afoot(at, yaw, name, time, sling = true) {
    const S = scene;
    if (!S.afoot) {
      const gun = model.gun?.group, shown = gun?.visible, slung = sling ? model.board.clone() : null, before = S.cleanup;
      if (slung) {
        slung.visible = true;
        slung.position.set(0.03, -0.12, -0.17);
        slung.rotation.set(Math.PI / 2, 0, 0.32);
        model.packHolder.add(slung);
        model.board.visible = false;
      }
      if (gun) gun.visible = false;
      S.afoot = () => { if (slung) { model.packHolder.remove(slung); model.board.visible = true; } if (gun) gun.visible = shown; S.afoot = null; };
      S.cleanup = () => { S.afoot?.(); before?.(); };
    }
    model.root.visible = true;
    model.root.position.copy(at);
    model.root.rotation.set(0, yaw, 0);
    model.tilt.rotation.z = model.tilt.position.x = model.rider.position.y = model.rider.rotation.y = model.torso.rotation.x = 0;
    model.play?.(name, 1, 1, time, true);
  }
  const aboard = () => scene.afoot?.();
  // A blink to black around a hard cut at `at` (0..1).
  const blink = (t, at) => 1 - smooth(Math.abs(t - at) / 0.16);

  return {
    get active() { return scene !== null; },
    get cast() { return cast; },   // (for the editor, and for checking a scene's framing from the console)
    // Where the one that is playing has got to: { time, duration, waiting } (null: nothing is playing). For the editor.
    get info() { return scene ? { time: scene.time, duration: scene.duration, waiting: scene.waiting } : null; },
    // Jump the one that is playing to `seconds` in (the editor's slider; handy from the console too).
    seek(seconds) {
      if (!scene) return;
      scene.allHolds ??= [...scene.holds];
      scene.holds = scene.allHolds.filter((h) => h > seconds + 0.01);
      if (seconds < scene.time) scene.marks = {};   // (going back: its one-off moments can happen again)
      scene.time = seconds;
    },

    update(dt) {
      // A scene with lines to read stops at the end of each (scene.holds: the times) until next() is called.
      if (scene.skippable && !scene.keep && skipStory()) return finish(true);   // (story scenes switched off: straight to what follows)
      scene.allHolds ??= [...scene.holds];
      // (A line over a fight, a boss arriving, does not wait for ever: scene.auto seconds and it moves on.)
      if (scene.waiting && scene.auto && (scene.waited = (scene.waited || 0) + dt) > scene.auto) { scene.waited = 0; this.next(); }
      const hold = scene.holds[0];
      scene.waiting = hold !== undefined && scene.time + dt >= hold;
      scene.time = scene.waiting ? hold : scene.time + dt;
      document.body.classList.toggle('cut-wait', scene.waiting);
      scene.step(scene.time, dt);
      if (scene && scene.time >= scene.duration) finish(true);
    },

    // Stop whatever is playing without its ending (the run is being reset).
    cancel() { if (scene) finish(false); },
    // The player has read the line: on to the next one. (Pressed early, it cuts straight to the end of this line.)
    next() {
      if (!scene || !scene.holds.length) return;
      scene.time = Math.max(scene.time, scene.holds.shift()) + 0.05;
      scene.waiting = false;
      playNext();
    },
    // Cut a scene short and go straight to what follows it, if it is one that allows that.
    skip() { if (scene?.skippable) finish(true); },

    // ---- The story, a scene at a time ---------------------------------------------------
    // Each of these is a handful of shots with a line of story under them, cut like every other scene here
    // (a white flash on each cut, a snap zoom, speed lines). All of them can be skipped with Enter.
    //
    // shots: [{ for: seconds, line: the caption, cam(k, t): place `eye` and `target` (k: 0..1 through the shot, t:
    // seconds into it) and return { fov, shake, lines }, at(): runs once as the shot starts }]
    // glow: how bright the camera's lamp is (for somewhere dark).
    story(shots, done, glow = 0, cue = null) {
      const starts = [];
      let total = 0;
      for (const sh of shots) { starts.push(total); total += sh.for; }
      lamp.color.set(0xffe2b0);
      begin(total + 0.3, (t, dt) => {
        let i = shots.length - 1;
        while (i > 0 && t < starts[i]) i--;
        const sh = shots[i], into = t - starts[i], v = sh.cam(Math.min(1, into / sh.for), into) || {};
        if (!scene.marks[`shot${i}`]) { scene.marks[`shot${i}`] = true; sh.at?.(); }
        model.update(dt, skater, skater.pos, null, false);
        model.inhale = v.drag || 0;
        horde.draw(dt);
        view(v.fov ?? 50, v.shake ?? 0);
        lamp.position.copy(eye).y += 1.3;
        lamp.intensity = glow * (1 + 1.2 * Math.exp(-into * 5));
        hud.lines(v.lines || 0);
        hud.caption(t < total ? sh.line : null, NEXT);
        const dark = blink(t, total);
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#ffffff', 0.85 * Math.exp(-into * 8));
        if (t >= total) { model.inhale = 0; goHome(); }
      }, () => { model.inhale = 0; done?.(); });
      scene.skippable = true;
      if (cue) score(cue);
      scene.holds = shots.map((sh, i) => starts[i] + sh.for - (i === shots.length - 1 ? 0.2 : 0.03));   // (at the end of every line)
    },

    // The start of it all (level 1). It gives very little away: who took what from him comes out a boss at a time.
    intro(done) {
      const p = skater.pos, y = heightAt(p.x, p.z);
      playWind(11);
      playBell();
      this.story([
        { for: 2.6, line: 'Kirky has nothing left to lose.', cam: (k) => {   // from high over the graves, coming down
          eye.set(p.x + 26 - 10 * k, y + 34 - 20 * k, p.z + 30 - 10 * k);
          target.set(p.x, y + 1, p.z);
          return { fov: 52 };
        } },
        { for: 2.4, line: 'Somebody took it all. Fair and square, they say.', at: () => playCrow(), cam: (k) => {   // low between the headstones, tracking past him
          eye.set(p.x - 9 + 5 * k, y + 0.5, p.z - 7);
          target.set(p.x, y + 1.3, p.z);
          return { fov: 40, lines: 0.5 };
        } },
        { for: 2.4, line: 'He is going to ask for it back. The way there runs through a cemetery.', cam: (k) => {   // over his shoulder, out into the dark where it will come from
          eye.set(p.x + 1.05, y + 1.7, p.z + 3.3 - 0.5 * k);   // (low enough, and far enough back, that his head and his hat stay whole in the corner of the frame)
          target.set(p.x - 4, y + 2.2, p.z - 60);
          return { fov: 58 - 26 * smooth(k / 0.12), shake: 0.01 };
        } },
        { for: 2.2, line: 'He brought a board, a gun and a boof. Something keeps the cemetery.', at: () => playInhale(1.4), cam: (k, t) => {   // his face: one long drag
          eye.set(p.x + 0.5, y + 1.72, p.z - 1.5 + 0.2 * k);
          target.set(p.x, y + 1.66, p.z);
          return { fov: 30 - 6 * smooth(t / 0.15), drag: smooth((t - 0.4) / 0.5) * (1 - smooth((t - 1.7) / 0.3)), lines: 0.4 };
        } },
      ], done, 0, 'grave');
    },

    // Arriving in level 2: what the Catacombs are.
    under(done) {
      const p = skater.pos, y = heightAt(p.x, p.z);
      playCaveAir(9);
      playDrips(8.5);
      this.story([
        { for: 2.4, line: 'The portal comes out under the graves.', cam: (k) => {   // his face, as the lamp comes on
          eye.set(p.x + 0.6, y + 1.7, p.z - 1.7);
          target.set(p.x, y + 1.62, p.z);
          return { fov: 44 - 16 * smooth(k / 0.1) };
        } },
        { for: 2.6, line: 'The catacombs. Everyone who could not pay ends up down here.', at: () => playBones(0.6), cam: (k) => {   // along the floor, down the tunnel
          eye.set(p.x - 3.5, y + 0.4, p.z + 5 - 0.8 * k);   // (it creeps in no further than keeps all of him in the frame)
          target.set(p.x + 1, y + 2.5, p.z - 40);
          return { fov: 62, lines: 0.3 };
        } },
        { for: 2.6, line: 'Something has been built out of them.', at: () => { playBones(1.3); playCreak(1.6); }, cam: (k) => {   // from the roof, straight down on him: how small he is
          eye.set(p.x + 0.5, y + 16 - 4 * k, p.z + 0.5);
          target.set(p.x, y, p.z);
          return { fov: 48, shake: 0.02 };
        } },
      ], done, 260, 'deep');
    },

    // A boss was carrying a casino chip: it is thrown clear of what is left of him and lands at Kirky's feet.
    // from: where his body was ({ x, y, z }: about chest height). lines: the two captions.
    chipDrop(from, lines, done) {
      const p = skater.pos, floor = heightAt(p.x, p.z), chip = props().chip, start = new THREE.Vector3(from.x, from.y, from.z);
      dir.set(from.x - p.x, 0, from.z - p.z).normalize();   // (from Kirky toward where he was)
      const rest = new THREE.Vector3(p.x, floor + 0.05, p.z).addScaledVector(dir, 1.3), across = new THREE.Vector3(dir.z, 0, -dir.x);
      rest.y = heightAt(rest.x, rest.z) + 0.05;   // (the ground where it lands, not where he is standing)
      start.y = Math.max(start.y, heightAt(start.x, start.z) + 1);
      stage.visible = chip.visible = true;
      lamp.color.set(0xffe2b0);
      playChipFlip(1.9);
      begin(4.6, (t, dt) => {
        const f = smooth(t / 1.9), k = (a, len) => smooth((t - a) / len);
        chip.position.copy(start).lerp(rest, f);
        chip.position.y += Math.sin(f * Math.PI) * 5;
        chip.position.y = Math.max(chip.position.y, heightAt(chip.position.x, chip.position.z) + 0.05);   // (never under a rise on the way)
        chip.rotation.set((1 - f) * 24, Math.atan2(-dir.z, dir.x) + t * 3 * (1 - f), 0.12 * (1 - f));   // (it comes to rest the right way up for the camera)
        model.update(dt, skater, skater.pos, null, false);
        horde.draw(dt);
        if (t < 1.9) {                // with it, in the air
          eye.copy(chip.position).addScaledVector(across, 1.5).addScaledVector(dir, -1.4);
          eye.y = Math.max(chip.position.y + 0.35, heightAt(eye.x, eye.z) + 0.5);   // (the camera stays above the ground too)
          target.copy(chip.position);
          view(30, 0.005);
        } else {                      // on the ground: a snap zoom on what it says
          eye.copy(rest).addScaledVector(dir, -0.75).addScaledVector(across, 0.25);
          eye.y = Math.max(rest.y + 2.1, heightAt(eye.x, eye.z) + 1.2);
          target.copy(rest);
          view(54 - 20 * k(1.9, 0.2), 0.003);
        }
        lamp.position.copy(eye).y += 1.2;
        lamp.intensity = 60;
        hud.lines(t < 1.9 ? 0.9 : 0);
        hud.caption(t < 4.3 ? lines[t < 1.9 ? 0 : 1] : null, NEXT);
        const dark = blink(t, 4.3);
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#ffffff', 0.85 * Math.max(Math.exp(-t * 8), t >= 1.9 ? Math.exp(-(t - 1.9) * 8) : 0));
        once('land', t, 1.9, () => playChipLand());
        if (t >= 4.3) goHome();
      }, done);
      score('grave');
      scene.skippable = true;
      scene.holds = [1.87, 4.1];
    },

    // ---- The House is bust: the start of the Long Way Down --------------------------------
    // Kirky outside the casino (its front, seen for the first and last time) as the ground starts to shake; from
    // down the hill, the towers go and the whole front after them, and the dust comes over where it stood; the three
    // brothers rise out of it; his face; and then down the hill: "Run".
    // descent: systems/descent.js (its stage() puts the dust and the ghosts where each shot wants them).
    collapse(descent, done) {
      const p = skater.pos, y = heightAt(p.x, p.z);
      playWind(7, 0.7);
      this.story([
        { for: 3.0, line: 'The DeadSlide Casino, at the top of the hill.', cam: (k, t) => {   // from over its roof: the street, the city and everything below
          descent.stage(-95, t, 0, 0);
          eye.set(p.x + 34 - 10 * k, y + 78, p.z + 96 - 12 * k);
          target.set(p.x, y - 30, p.z - 330);
          return { fov: 58 };
        } },
        { for: 2.8, line: 'Babitus is dead. The house is bust.', at: () => playCreak(2.6), cam: (k, t) => {   // low, down the steps from him: the whole front over his head
          descent.stage(-95, t, 0, 0.05 * k);
          eye.set(p.x - 7 + 3 * k, y + 0.6, p.z - 26 - 3 * k);
          target.set(p.x, y + 21, p.z + 12);
          return { fov: 66, shake: 0.01 + 0.07 * k };
        } },
        { for: 1.6, line: 'Nothing is holding it up now.', at: () => { playCreak(1.6); playGlass(); }, cam: (k, t) => {   // up one tower as it starts to go
          descent.stage(-95, t + 3, 0, 0.05 + 0.2 * k);
          eye.set(p.x - 9, y + 1.2, p.z - 6);
          target.set(p.x - 19, y + 44 - 6 * k, p.z + 14);
          return { fov: 58 - 12 * smooth(k / 0.12), shake: 0.12, lines: 0.4 };
        } },
        { for: 4.0, line: 'And the hill it stood on is coming down with it.', at: () => { playBossBurst(); playRumble(); playDustWave(3.8); }, cam: (k, t) => {   // from down the hill: all of it goes, and the dust comes over where it stood
          descent.stage(-70 + 58 * smooth((k - 0.4) / 0.6), t + 5, 0, 0.25 + 0.75 * smooth(k / 0.6));
          eye.set(p.x + 16, heightAt(p.x + 16, p.z - 84) + 2.5, p.z - 84 - 8 * k);
          target.set(p.x, y + 20, p.z + 14);
          return { fov: 66 - 10 * smooth(k / 0.1), shake: 0.25, lines: 0.5 };
        } },
        { for: 2.6, line: 'All three brothers are coming down with it.', at: () => { playGhosts(); playBones(0.8); }, cam: (k, t) => {   // from the ground, past him, up at the three of them rising
          descent.stage(-14, t + 6, k / 0.6);
          eye.set(p.x + 1.6 - 0.8 * k, y + 0.35, p.z - 10.5);
          target.set(p.x, y + 5.5 + 1.5 * k, p.z + 12);
          return { fov: 66, shake: 0.1 };
        } },
        { for: 1.5, line: 'Kirky does not look back.', at: () => playInhale(0.9), cam: (k, t) => {   // his face: a snap zoom, and a drag
          descent.stage(-12, t + 9, 1);
          eye.set(p.x + 0.45, y + 1.72, p.z - 1.5);
          target.set(p.x, y + 1.66, p.z);
          return { fov: 34 - 10 * smooth(t / 0.12), shake: 0.03, drag: smooth((t - 0.2) / 0.4) * (1 - smooth((t - 1.1) / 0.3)) };
        } },
        { for: 2.2, line: 'Three kilometres to the bottom.', at: () => { playTitleSting(); hud.bossIntro('Run', 'The Long Way Down'); }, cam: (k, t) => {   // over his shoulder, down the hill, pushing in
          descent.stage(-44, t + 11, 1);   // (behind the camera now: it is all over this shot otherwise)
          eye.set(p.x + 1.3, y + 2.3 + 0.6 * k, p.z + 4 - 2.4 * smooth(k));
          target.set(p.x, y - 6, p.z - 70);
          return { fov: 72 - 16 * smooth(t / 0.15), shake: 0.12, lines: 1 };
        } },
      ], () => { hud.hideBossIntro(); done?.(); }, 28, 'collapse');
    },

    // ---- The last cigarette: the ending -----------------------------------------------------
    // On the Moon, and in no hurry. The Earth, on its own; from high up, something small falls out of the sky and
    // hits the plain; Kirky from behind, standing, looking up at it; his face; the cigarette he has left, snapped in
    // the fall; he lights it anyway and takes a long one; the camera goes slowly round him (anyone else who is up
    // here, one for each Moon costume you have found, is sitting on the ramp behind him in the distance: nobody says so); and then all of it
    // from behind, the last two lines, the title and the credits.
    // look: currentLook(). costumes: the ids of the costumes you own. time: the run's time, as text.
    lastCigarette({ look, costumes, time }, done) {
      const p = skater.pos, y = heightAt(p.x, p.z), stageRoot = model.root.parent;
      const toEarth = new THREE.Vector3(0.35, 0, 0.7).normalize(), right = new THREE.Vector3(toEarth.z, 0, -toEarth.x), yaw = Math.atan2(toEarth.x, toEarth.z);
      const earth = new THREE.Vector3(0.35, 0.62, 0.7).normalize();
      const head = new THREE.Vector3(), headOf = (actor) => { actor.root.updateMatrixWorld(true); return actor.torso.localToWorld(head.set(0, 0.78, 0)); };
      // The cast.
      const kirky = cast.kirky || (cast.kirky = new SkaterModel(stageRoot));
      const dress = (smoke) => kirky.applyLook({ ...look, outfit: 'none', mask: 'none', smoke });
      dress('nothing');
      kirky.setVisible(true);
      kirky.root.rotation.set(0, yaw, 0);
      // Whoever else is up here sits in a row near the top of the big ramp behind him, a long way off, watching.
      costumes.forEach((id, i) => {
        const actor = cast.others[i] || (cast.others[i] = new SkaterModel(stageRoot));
        actor.applyLook({ ...look, outfit: id, mask: id, smoke: 'nothing' });
        actor.setVisible(true);
        const x = p.x + 2 + (i - (costumes.length - 1) / 2) * 2.5, z = p.z - 37.3;
        actor.root.position.set(x, heightAt(x, z), z);
        actor.root.rotation.set(0, Math.atan2(p.x - x, p.z - z), 0);
        // Sat down: no board, legs out in front, leaning back a little.
        actor.board.visible = false;
        actor.rider.position.y = -0.55;
        actor.tilt.rotation.x = -0.18;
        actor.frontLeg.rotation.set(1.35, 0, 0.12);
        actor.backLeg.rotation.set(1.3, 0, -0.12);
      });
      model.setVisible(false);
      //            Earth  fall  behind  face  broken  lights  round  last
      const CUTS = [0,     4.0,  8.0,    11.5, 14.5,   17.5,   23.5,  30.0], END = 50, FALL = CUTS[1] + 1.1, HIT = FALL + 1.3, LIGHT = CUTS[5] + 1.0;
      const LINES = ['The Moon.', 'No tables. No dealers. No brothers.', 'He never did get his money back.', 'One boof left.', 'Broken in the fall.', 'It still smokes.', 'Down there, a hill is missing.'];
      const LAST = [[1.5, 'The house always wins.'], [4.5, 'Not tonight.'], [10, `Down the hill in ${time}.`], [13, 'A game by Babitus & Clauditus.'], [16, 'Thanks for playing.']];
      lamp.color.set(0xfff2dc);
      begin(END + 0.5, (t, dt) => {
        const k = (a, len) => smooth((t - a) / len);
        let shot = 0;
        while (shot < CUTS.length - 1 && t >= CUTS[shot + 1]) shot++;
        const into = t - CUTS[shot];
        // Kirky: not here yet; then out of the sky, and down.
        const drop = t < FALL ? 1 : Math.max(0, 1 - ((t - FALL) / (HIT - FALL)) ** 2);
        kirky.root.position.set(p.x, y + 170 * drop, p.z);
        kirky.root.visible = t >= FALL;
        once('land', t, HIT, () => playMoonLand());
        once('snapped', t, CUTS[4], () => { dress('broken'); kirky.smoking = kirky.ember.visible = false; playSnap(); });   // (not lit yet)
        once('lit', t, LIGHT, () => { kirky.smoking = kirky.ember.visible = true; playLighter(); });
        once('drag', t, LIGHT + 0.5, () => playInhale(2.2));
        once('breath', t, LIGHT + 3.1, () => playExhale(2.4));
        LAST.forEach(([at], i) => once(`credit${i}`, t, CUTS[7] + at, () => playCredit()));
        const lit = t >= LIGHT ? Math.exp(-(t - LIGHT) * 5) : 0;   // the lighter
        kirky.inhale = shot === 5 ? k(LIGHT + 0.5, 0.6) * (1 - k(LIGHT + 2.6, 0.4)) : 0;
        kirky.updateSmoke(dt);
        if (shot === 5 && t > LIGHT + 3.1) kirky.exhale(dt);
        horde.draw(dt);
        let lines = 0, shake = t >= HIT ? 0.6 * Math.exp(-(t - HIT) * 4) : 0, fov = 50;
        if (shot === 0) {             // 1: the Earth, and nothing else. A slow push in
          eye.set(p.x, y + 1.6, p.z);
          target.copy(eye).addScaledVector(earth, 100);
          fov = 46 - 16 * k(0, 4);
        } else if (shot === 1) {      // 2: from a long way up and off: something falls, and hits
          eye.set(p.x, y + 30, p.z).addScaledVector(right, 44).addScaledVector(toEarth, -34);
          target.set(p.x, y + 14 - 13 * k(FALL, HIT - FALL), p.z);
          fov = 46 - 8 * k(HIT, 1.5);
          lines = t > FALL && t < HIT ? 0.8 : 0;
        } else if (shot === 2) {      // 3: behind him, low: he is up, and looking at it
          eye.set(p.x, y + 0.5, p.z).addScaledVector(toEarth, -6.5 + 0.8 * k(CUTS[2], 3.5)).addScaledVector(right, 1.8);
          target.set(p.x, y + 6.2, p.z).addScaledVector(toEarth, 9);
          fov = 64;
        } else if (shot === 3) {      // 4: his face
          headOf(kirky);
          eye.copy(head).addScaledVector(toEarth, 1.6).addScaledVector(right, -0.45);
          target.copy(head);
          fov = 36 - 9 * smooth(into / 0.14);
        } else if (shot === 4) {      // 5: right in on what is in his mouth
          headOf(kirky);
          eye.copy(head).addScaledVector(toEarth, 0.85).addScaledVector(right, -0.3);
          eye.y -= 0.06;
          target.copy(head).addScaledVector(toEarth, 0.16).addScaledVector(right, -0.03);
          target.y -= 0.05;
          fov = 30 - 10 * smooth(into / 0.12); lines = 0.7;
        } else if (shot === 5) {      // 6: he lights it, and takes a long one. Very slowly closer
          headOf(kirky);
          eye.copy(head).addScaledVector(toEarth, 1.45 - 0.3 * k(CUTS[5], 6)).addScaledVector(right, -0.75);
          eye.y += 0.08;
          target.copy(head);
          fov = 34;
        } else if (shot === 6) {      // 7: round him, slowly, from his shoulder to his face
          headOf(kirky);
          const a = -2.5 + 2.9 * k(CUTS[6], 6.5);
          eye.set(p.x, head.y + 0.1, p.z).addScaledVector(toEarth, Math.cos(a) * 4.6).addScaledVector(right, Math.sin(a) * 4.6);
          target.copy(head);
          fov = 44;
        } else {                      // 8: all of it from behind, drifting in, under the Earth
          const f = k(CUTS[7], END - CUTS[7]);
          eye.set(p.x, y + 1.1 + 0.3 * f, p.z).addScaledVector(toEarth, -7 - 2 * f).addScaledVector(right, 1.5 - 1.5 * f);   // (the Earth has to stay in the top of the frame)
          target.copy(eye).addScaledVector(toEarth, 30).y += 8.9;
          fov = 72;
          once('title', t, CUTS[7] + 7, () => { playEndChord(); hud.bossIntro('DeadSlide', 'The End'); });
        }
        view(fov, shake);
        lamp.position.copy(eye).y += 1;
        lamp.intensity = (shot >= 3 && shot <= 6 ? 6 : 0) + 60 * lit;
        lamp.color.set(lit > 0.05 ? 0xff9a3a : 0xfff2dc);
        hud.lines(lines);
        let line = shot < 7 && into > 0.5 ? LINES[shot] : null;
        if (shot === 7) for (const [at, text] of LAST) if (into >= at) line = text;
        hud.caption(t < END - 1.5 ? line : null, NEXT);
        // Only the hard cuts flash (the Earth fades up out of black, and the end fades back into it).
        let pop = t >= HIT ? Math.exp(-(t - HIT) * 6) : 0;
        for (const c of [CUTS[3], CUTS[4], CUTS[5]]) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        const dark = Math.max(1 - k(0, 2.5), blink(t, CUTS[1]), blink(t, CUTS[2]), blink(t, CUTS[6]), blink(t, CUTS[7]), k(END - 2.5, 2.5));
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#ffffff', pop * 0.85);
      }, () => { hud.hideBossIntro(); done?.(); });
      score('moon');
      scene.skippable = true;
      scene.keep = true;   // (the ending plays even with the story scenes switched off)
      scene.holds = [...CUTS.slice(1).map((c) => c - 0.2), ...LAST.slice(1).map(([at]) => CUTS[7] + at - 0.05), END - 2.6];
      scene.cleanup = () => {
        kirky.inhale = 0;
        kirky.root.visible = true;
        kirky.setVisible(false);
        for (const actor of cast.others) actor.setVisible(false);
        model.setVisible(true);
        hud.hideBossIntro();
      };
    },

    // What Babitus was full of. Gold chips pour out of where he stood and rain down on the marble; the floor
    // splits under them and takes the lot; Kirky watches it go. at: where he died ({ x, z }).
    takings(at, done) {
      const { coins, hole, rim } = props(), floor = heightAt(at.x, at.z), p = skater.pos;
      const N = coins.count, chips = Array.from({ length: N }, (_, i) => ({
        pos: new THREE.Vector3(at.x, floor + 2 + Math.random() * 5, at.z), wait: i * 0.02, spin: Math.random() * 6,
        vel: new THREE.Vector3((Math.random() - 0.5) * 12, 6 + Math.random() * 9, (Math.random() - 0.5) * 12),
      }));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), head = new THREE.Vector3();
      const CUTS = [0, 3.0, 6.0], END = 8.4;
      const LINES = ['Every coin Kirky ever lost.', 'The floor takes it back.', 'Nothing left to collect. Time to go.'];
      stage.visible = coins.visible = true;
      hud.hideBossIntro();
      playCoinsPour(2.8);
      dir.set(p.x - at.x, 0, p.z - at.z).normalize();
      const toKirky = dir.clone(), across = new THREE.Vector3(toKirky.z, 0, -toKirky.x);
      begin(END + 0.3, (t, dt) => {
        const k = (a, len) => smooth((t - a) / len), shot = t < CUTS[1] ? 0 : t < CUTS[2] ? 1 : 2, open = k(CUTS[1] + 0.2, 1.4);
        // The chips: thrown up, down, a bounce or two; and once the floor has opened, in.
        chips.forEach((c, i) => {
          if ((c.wait -= dt) > 0) return coins.setMatrixAt(i, m.makeScale(0, 0, 0));
          const out = Math.hypot(c.pos.x - at.x, c.pos.z - at.z), over = open > 0 && out < 4.6 * open;
          c.vel.y -= 22 * dt;
          if (open > 0 && !over) { c.vel.x += (at.x - c.pos.x) * 2.2 * dt; c.vel.z += (at.z - c.pos.z) * 2.2 * dt; }   // (the floor tips toward the hole)
          c.pos.addScaledVector(c.vel, dt);
          if (!over && c.pos.y < floor + 0.05) { c.pos.y = floor + 0.05; c.vel.y *= -0.35; c.vel.x *= 0.8; c.vel.z *= 0.8; if (Math.abs(c.vel.y) > 2 && i % 9 === 0) playCoin(Math.random()); }
          const flat = c.pos.y < floor + 0.1 && Math.abs(c.vel.y) < 1.5;
          coins.setMatrixAt(i, m.compose(c.pos, q.setFromEuler(e.set(flat ? 0 : c.spin + t * 9, c.spin, flat ? 0 : t * 7)), one));
        });
        coins.instanceMatrix.needsUpdate = true;
        once('crack', t, CUTS[1] + 0.2, () => playFloorCrack());
        hole.visible = rim.visible = open > 0;
        hole.position.set(at.x, floor + 0.04, at.z);
        rim.position.copy(hole.position).y += 0.01;
        hole.scale.setScalar(0.01 + 4.6 * open);
        rim.scale.setScalar(0.01 + 4.7 * open);
        model.update(dt, skater, skater.pos, null, false);
        horde.draw(dt);
        if (shot === 0) {             // 1: on the floor, as it comes down all round
          eye.set(at.x, floor + 0.35, at.z).addScaledVector(toKirky, 7.5 - 1.5 * k(0, 3)).addScaledVector(across, 2.5);
          target.set(at.x, floor + 2.2, at.z);
          view(56, 0.03);
        } else if (shot === 1) {      // 2: from straight above: the floor opens, and it all goes
          eye.set(at.x + 0.5, floor + 17 - 3 * k(CUTS[1], 3), at.z + 0.5);
          target.set(at.x, floor, at.z);
          view(50, 0.05 + 0.1 * open);
        } else {                      // 3: Kirky, watching it go
          model.root.updateMatrixWorld(true);
          head.set(0, 1.66, 0).applyQuaternion(model.root.quaternion).add(p);
          eye.copy(head).addScaledVector(facing(side), 1.7).addScaledVector(across, 0.5);   // (in front of him, whichever way he is facing)
          target.copy(head);
          view(34 - 8 * k(CUTS[2], 0.14), 0.02);
        }
        lamp.position.copy(eye).y += 1;
        lamp.intensity = shot === 2 ? 12 : 0;
        hud.lines(shot === 0 ? 0.5 : 0);
        hud.caption(t < END ? LINES[shot] : null, NEXT);
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        const dark = blink(t, END);
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#ffc233', pop * 0.6);
        if (t >= END) goHome();
      }, done);
      score('house');
      scene.skippable = true;
      scene.holds = [CUTS[1] - 0.03, CUTS[2] - 0.03, END - 0.2];
    },

    // Out of the House, by the doors he came in through (they are still hanging open). From behind him, the doorway
    // and the night in it, the room coming apart; his face, one look back; and then up the curve of the wall and out.
    leaveHouse(done) {
      const p = portal.position, from = renderPos.clone(), CUTS = [0, 2.6, 4.8], END = 6.8, head = new THREE.Vector3(), at = new THREE.Vector3();
      const sill = new THREE.Vector3(p.x, WALL_TOP + 0.4, p.z + 5.5);   // (the doorway is at the top of the wall's curve)
      const LINES = ['Babitus owed him everything. Babitus cannot pay.', 'So Kirky takes the only thing left in the place.', 'The way out. He left the doors open on the way in.'];
      dir.set(p.x - from.x, 0, p.z - from.z).normalize();
      const toDoors = dir.clone(), across = new THREE.Vector3(toDoors.z, 0, -toDoors.x);
      playCreak(2.5);
      begin(END + 0.2, (t, dt) => {
        const k = (a, len) => smooth((t - a) / len), shot = t < CUTS[1] ? 0 : t < CUTS[2] ? 1 : 2, go = k(CUTS[2] + 0.2, 1.5);
        centre.set(p.x, WALL_TOP + 6, p.z + 5);   // the middle of the doorway
        at.copy(from).lerp(sill, go * go);
        if (go > 0 && go < 1) at.y = Math.max(at.y, heightAt(at.x, Math.min(at.z, p.z + 4)));   // (up the wall, not through it)
        model.update(dt, skater, at, null, false);
        horde.draw(dt);
        if (shot === 0) {             // 1: behind him, low: the doorway, and the night in it
          eye.copy(from).addScaledVector(toDoors, -5.5 + 0.8 * k(0, 2.6)).addScaledVector(across, 1.6);
          eye.y = from.y + 0.6;
          target.copy(centre);
          view(58, 0.06 + 0.1 * k(0, 2.6));
        } else if (shot === 1) {      // 2: his face: one look back
          head.set(0, 1.66, 0).add(from);
          eye.copy(head).addScaledVector(facing(side), 1.6).addScaledVector(across, -0.5);
          target.copy(head);
          view(34 - 8 * k(CUTS[1], 0.14), 0.05);
        } else {                      // 3: from up in the room: up the wall, and out
          eye.copy(from).addScaledVector(toDoors, -9).addScaledVector(across, -4);
          eye.y = from.y + 6;
          target.copy(at).lerp(centre, 0.4);
          view(52 - 12 * go, 0.12);
        }
        lamp.position.copy(eye).y += 1;
        lamp.intensity = shot === 1 ? 12 : 0;
        hud.lines(shot === 2 ? go : 0);
        hud.caption(t < END - 0.4 ? LINES[shot] : null, NEXT);
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        hud.flash('#ffffff', Math.max(pop * 0.85, k(CUTS[2] + 1.3, 0.6)));
        once('gone', t, CUTS[2] + 0.2, () => { playPushOff(1.5); playWhoosh(); });
      }, () => { model.root.visible = false; done?.(); });
      score('house');
      scene.skippable = true;
      scene.holds = [CUTS[1] - 0.03, CUTS[2] - 0.03, CUTS[2] + 0.15];
    },

    // "The house wins": Babitus has killed him. From the floor beside Kirky, up at him; his face; and from the
    // chandelier, the two of them, as the title lands. b: Babitus.
    houseWins(b, done) {
      const p = skater.pos, tall = b.T.height * b.scale, wide = b.T.radius * b.scale, CUTS = [0, 1.8, 3.2], END = 5.4;
      b.posed = true;
      playCreak(1.6);
      begin(END + 0.2, (t, dt) => {
        const k = (a, len) => smooth((t - a) / len), ground = heightAt(b.x, b.z), floor = heightAt(p.x, p.z);
        dir.set(p.x - b.x, 0, p.z - b.z).normalize();
        side.set(dir.z, 0, -dir.x);
        b.yaw = Math.atan2(dir.x, dir.z);
        b.roar = 0.6 * k(CUTS[1], 0.2) * (1 - k(CUTS[2] - 0.3, 0.3));
        afoot(eye.set(p.x, floor + 0.1, p.z), Math.atan2(-dir.x, -dir.z), 'die', 0.4 + t * 1.3, false);   // (down, as he goes when he dies, facing what did it: and staying down)
        horde.draw(dt);
        if (t < CUTS[1]) {            // 1: from the marble beside him, up at what did it
          eye.set(p.x, floor + 0.3, p.z).addScaledVector(dir, 3).addScaledVector(side, 1.6);
          target.set(b.x, ground + tall * 0.7, b.z);
          view(62, 0.02);
        } else if (t < CUTS[2]) {     // 2: his face
          if (b.eyesAt) target.copy(b.eyesAt); else target.set(b.x, ground + tall * 0.86, b.z).addScaledVector(dir, wide * 0.3);
          eye.copy(target).addScaledVector(dir, wide * 0.7 + 2.2).addScaledVector(side, 0.4);
          view(40 - 14 * k(CUTS[1], 0.14), 0.04);
        } else {                      // 3: from the chandelier
          eye.set(p.x + 1.5, floor + 13 - 3 * k(CUTS[2], 2), p.z + 1.5);   // (straight down on him)
          target.set(p.x, floor, p.z);
          view(50, 0.02);
        }
        hud.dread(0.5 * k(0, 1));
        hud.lines(t >= CUTS[1] && t < CUTS[2] ? 0.8 : 0);
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        const dark = blink(t, END);
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#ffffff', pop * 0.85);
        once('laugh', t, CUTS[1], () => playLaugh());
        once('title', t, CUTS[2], () => { playTitleSting(); hud.bossIntro('The house wins', b.T.title); });
        if (t >= END) goHome();
      }, () => { hud.hideBossIntro(); done?.(); });
      score('house');
      say(CUTS[2] + 0.6, END - 0.3, 'It always does. Almost always.');
    },

    // You have finished the game: here is what you get. Everything goes dark, the gold broken cigarette drops in
    // out of a burst of light and turns in front of you, sparks coming off it, and its name lands under it.
    reward(done) {
      const { prize, rays, dark, sparks } = props(), from = new THREE.Vector3(skater.pos.x, heightAt(skater.pos.x, skater.pos.z) + 60, skater.pos.z);
      const bits = Array.from({ length: 120 }, () => ({ v: new THREE.Vector3().randomDirection().multiplyScalar(1 + Math.random() * 3.5), born: 0.45 + Math.random() * 0.25 }));
      const spot = sparks.geometry.attributes.position;
      stage.visible = prize.visible = rays.visible = dark.visible = sparks.visible = true;
      const END = 6.5;
      begin(END + 0.3, (t) => {
        const k = (a, len) => smooth((t - a) / len), into = Math.max(0, t - 0.45);
        eye.copy(from);
        target.copy(from).x += 10;
        view(40, 0.25 * Math.exp(-into * 6) * (t >= 0.45 ? 1 : 0));
        dark.position.copy(from).x += 9;
        dark.rotation.y = -Math.PI / 2;
        rays.position.copy(from).x += 6;
        rays.position.y += 0.75;   // (it all sits in the top half of the screen: its name goes across the middle)
        rays.rotation.set(0, -Math.PI / 2, t * 0.5);
        rays.scale.setScalar(0.01 + 1.05 * k(0.45, 0.4) + 0.05 * Math.sin(t * 3));
        // It drops in from above, lands with a bounce, and then just turns.
        const grow = t < 0.45 ? 0 : 1 + 0.5 * Math.exp(-into * 5) * Math.cos(into * 16);
        prize.position.copy(from).x += 4.2;
        prize.position.y += 0.72 + 6 * (1 - k(0.1, 0.4)) ** 2 + 0.08 * Math.sin(t * 2.2);
        prize.scale.setScalar(Math.max(0.001, 1.15 * grow));
        prize.rotation.set(0.25 * Math.sin(t * 1.3), Math.PI / 2 + t * 1.6, 0.2);
        bits.forEach((b, i) => {
          const age = t - b.born;
          if (age < 0) return spot.setXYZ(i, 0, -9999, 0);
          spot.setXYZ(i, prize.position.x + b.v.x * age * 0.25, prize.position.y + b.v.y * age - 1.6 * age * age, prize.position.z + b.v.z * age);
        });
        spot.needsUpdate = true;
        sparks.material.opacity = 1 - k(1.6, 1.6);
        hud.lines(0.5 * (1 - k(1.2, 1)));
        hud.caption(t > 1.6 && t < END - 0.2 ? 'The Golden BOOF. Yours to keep: he is wearing it now.' : null, NEXT);
        const dim = blink(t, END);
        if (dim > 0.02) hud.flash('#000', dim);
        else hud.flash('#fff2c0', t < 0.45 ? 0.3 * k(0.2, 0.25) : Math.exp(-into * 5));
        once('ta-da', t, 0.45, () => playFanfare());
        once('name', t, 0.9, () => hud.place('The Golden BOOF', 'You finished DeadSlide', true));
        if (t >= END) { hud.hideBossIntro(); goHome(); }
      }, () => { hud.hideBossIntro(); done?.(); });
      scene.skippable = true;
      scene.keep = true;
      scene.holds = [END - 0.5];
      scene.cleanup = () => hud.hideBossIntro();
    },

    // "Buried": the collapse has caught him. From in front, low, the wall of dust coming over his shoulder; a snap
    // zoom on his face as its shadow reaches him; then from high above, as it goes over the top of him.
    // descent: systems/descent.js (its bury() puts the dust where each shot wants it).
    buried(descent, done) {
      const p = skater.pos, s = 48 - p.z, head = new THREE.Vector3(), CUTS = [0, 1.4, 2.4], END = 4.0, DUST = '#5c4d3c';
      playBuried();
      begin(END + 0.2, (t, dt) => {
        const k = (a, len) => smooth((t - a) / len), shot = t < CUTS[1] ? 0 : t < CUTS[2] ? 1 : 2;
        // The dust: well back, then on his heels (in slow motion), then over him and on down the hill.
        const wall = t < CUTS[1] ? s - 34 + 18 * k(0, 1.4) : t < CUTS[2] ? s - 16 + 6 * k(CUTS[1], 1) : s - 10 + 44 * ((t - CUTS[2]) / 1.3) ** 2;
        descent.bury(wall, t * (shot === 1 ? 0.3 : 1));
        model.update(dt, skater, p, null, false);
        head.set(0, 1.66, 0).applyQuaternion(model.root.quaternion).add(p);
        horde.draw(dt);
        if (shot === 0) {             // 1: low, ahead of him, looking back up the hill past him
          eye.set(p.x + 2.6 - 1.2 * k(0, 1.4), p.y + 0.7, p.z - 7.5);
          target.set(p.x, p.y + 7, p.z + 16);
          view(64, 0.12 + 0.2 * k(0, 1.4));
        } else if (shot === 1) {      // 2: his face
          eye.set(head.x + 0.45, head.y + 0.05, head.z - 1.5);
          target.copy(head);
          view(34 - 10 * k(CUTS[1], 0.12), 0.05);
        } else {                      // 3: from high above: it goes over him
          eye.set(p.x + 3, p.y + 34 - 6 * k(CUTS[2], 1.4), p.z - 16);
          target.set(p.x, p.y, p.z + 4);
          view(50, 0.3);
        }
        lamp.position.copy(eye).y += 1.2;
        lamp.intensity = shot === 1 ? 14 * (1 - k(CUTS[1] + 0.2, 0.7)) : 0;   // (the light goes off his face as it reaches him)
        hud.lines(shot === 0 ? 1 : shot === 2 ? 0.6 : 0);
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        const under = shot === 2 ? k(CUTS[2] + 0.55, 0.6) : 0;
        if (under > 0.02) hud.flash(t > END - 0.5 ? '#000' : DUST, Math.min(1, under * 1.1));
        else hud.flash('#ffffff', pop * 0.85);
        once('hit', t, CUTS[2] + 0.6, () => hud.bossIntro('Buried', 'The Long Way Down'));
        if (t >= END) { hud.hideBossIntro(); goHome(); }
      }, () => { hud.hideBossIntro(); done?.(); });
      scene.skippable = true;
    },

    // "Launch": off the lip of the last ramp. In slow motion from the side as he leaves it; from out in front of it,
    // looking back: the dust comes over the ramp and Goyitus Ultimus comes down out of it with both hands out for
    // him, and gets nothing; from behind, the Moon ahead and nothing under him; his face, and a drag; and then a
    // long way off, getting smaller against it.
    // descent: systems/descent.js (its launch() clears the hill of ghosts and hangs the Moon).
    launch(descent, done) {
      const from = skater.pos.clone(), at = new THREE.Vector3(), head = new THREE.Vector3(), moon = new THREE.Vector3(), post = new THREE.Vector3(), hands = new THREE.Vector3();
      const CUTS = [0, 2.3, 4.9, 7.1, 9.2], LINES = ['The hill ends.', 'So do the brothers.', 'Kirky does not.', 'He has one boof left.', 'And somewhere quiet to smoke it.'], END = 12.2;
      const course = 48 - from.z;   // (how far down the hill the lip is: the dust is measured down it)
      lamp.color.set(0xdfe8ff);
      playWhoosh();
      playHush(END);
      begin(END + 0.3, (t, dt) => {
        const k = (a, len) => smooth((t - a) / len), shot = t < CUTS[1] ? 0 : t < CUTS[2] ? 1 : t < CUTS[3] ? 2 : t < CUTS[4] ? 3 : 4;
        // Where he is: barely moving through the first two shots (slow motion), then away.
        const slow = 5 * Math.min(t, CUTS[1]) + 9 * Math.max(0, Math.min(t, CUTS[2]) - CUTS[1]);
        const d = slow + 26 * Math.max(0, t - CUTS[2]) + 60 * Math.max(0, t - CUTS[4]) ** 2;
        at.copy(from).addScaledVector(FLIGHT, d);
        at.y += 4 * Math.sin(Math.min(1, d / 160) * Math.PI);
        descent.launch(at, 340 + 260 * k(CUTS[2], END - CUTS[2]));
        if (shot === 1) {
          // What is left of the brothers: out of the dust as it comes down the ramp, both hands a couple of metres
          // behind him and going through the air where he was; and then down on the lip of it, still reaching, as
          // he goes on without them.
          const f = (t - CUTS[1]) / (CUTS[2] - CUTS[1]), down = smooth((f - 0.25) / 0.6);
          hands.copy(at).addScaledVector(FLIGHT, -2.4).lerp(post.copy(from).addScaledVector(FLIGHT, 2.5), down);
          hands.y += 1.1 * (1 - down);
          descent.lunge(course - 74 + 34 * smooth(f), t, hands, at, 0.7 + 0.75 * down, t - CUTS[1]);
        }
        moon.copy(at).addScaledVector(FLIGHT, 900);
        model.update(dt, skater, at, null, false);
        if (shot !== 3) model.root.quaternion.multiply(spin.setFromAxisAngle(UP, t * 1.4));
        model.inhale = shot === 3 ? k(CUTS[3] + 0.3, 0.5) * (1 - k(CUTS[4] - 0.5, 0.3)) : 0;
        head.set(0, 1.66, 0).applyQuaternion(model.root.quaternion).add(at);
        horde.draw(dt);
        if (shot === 0) {             // 1: side on, very slowly, as the board leaves the lip
          eye.set(at.x + 7.5 - 1.5 * k(0, 2.3), at.y + 0.4, at.z - 1.5);
          target.copy(at).y += 1;
          view(40, 0.01);
        } else if (shot === 1) {      // 2: from out in front of the ramp, low, looking back at it: he is clear, and what comes after him is not
          const f = k(CUTS[1], CUTS[2] - CUTS[1]);
          eye.copy(from).addScaledVector(FLIGHT, slow + 10 - 2 * f);
          eye.x += 7 - 1.5 * f; eye.y += 4.5 + 1.5 * f;   // (high enough to see down onto the ramp he has just left)
          target.copy(at).lerp(hands, 0.5);
          target.y += 0.6;
          view(64 - 14 * k(CUTS[1], 0.18), 0.05 + 0.1 * f);
        } else if (shot === 2) {      // 3: from behind and under him: the Moon, and nothing else
          eye.copy(at).addScaledVector(FLIGHT, -7 + 1.5 * k(CUTS[2], 2.2));
          eye.x += 2; eye.y -= 1.6;
          target.copy(at).lerp(moon, 0.5);
          view(70 - 22 * k(CUTS[2], 0.15), 0.04);
        } else if (shot === 3) {      // 4: his face
          eye.copy(head).addScaledVector(FLIGHT, 1.5);
          eye.x += 0.5; eye.y -= 0.35;
          target.copy(head);
          view(32 - 6 * k(CUTS[3], 0.15), 0.006);
        } else {                      // 5: left behind: he gets smaller, and it gets bigger
          once('post', t, CUTS[4], () => post.copy(at).addScaledVector(FLIGHT, -9).add(dir.set(2.5, 2, 0)));
          eye.copy(post);
          target.copy(at).lerp(moon, 0.3);
          view(52 - 22 * k(CUTS[4], END - CUTS[4]), 0.01);
        }
        lamp.position.copy(eye).y += 1.2;
        lamp.intensity = shot === 3 ? 14 : 40;
        hud.lines(shot === 0 ? 0.5 : shot === 1 ? 0.9 : shot === 2 ? 1 : 0);
        hud.caption(t < END ? LINES[shot] : null, NEXT);
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        hud.flash('#ffffff', Math.max(pop * 0.85, k(END - 0.7, 0.7)));
        once('reach', t, CUTS[1], () => { playDustWave?.(); playGhosts?.(); });
        once('title', t, CUTS[2], () => { playTitleSting(); hud.bossIntro('Launch', 'The Long Way Down'); });
        once('drag', t, CUTS[3] + 0.3, () => playInhale(1.3));
        once('untitle', t, CUTS[3], () => hud.hideBossIntro());
        if (t >= END) { model.inhale = 0; hud.hideBossIntro(); goHome(); }
      }, () => { model.inhale = 0; hud.hideBossIntro(); done?.(); });
      score('air');
      scene.skippable = true;
      scene.holds = [CUTS[1] - 0.03, CUTS[2] - 0.03, CUTS[3] - 0.03, CUTS[4] - 0.03, END - 0.75];
    },

    // ---- The way up: from the Catacombs to the House ---------------------------------------
    // The story, told before the last fight, in two scenes.
    // prologue(): in the Catacombs. What is left of Rubistus comes apart, something gold is thrown clear of him and
    // lands at Kirky's feet (a chip from the casino), and Kirky goes up a ladder toward a round of street light.
    // street(): he comes up out of a manhole in the city, sees the casino lit up at the top of the hill, skates up to
    // it, and goes through its front doors without knocking. (main.js moves the game to the hill between the two.)
    prologue(done) {
      const B = ENEMY_TYPES.boss2, s = skater.pos, bx = s.x, bz = s.z - 15, ground = heightAt(bx, bz), floor = heightAt(s.x, s.z);
      const body = { name: 'boss2', T: B, x: bx, y: ground, z: bz, elite: false, scale: B.scale, hp: 0, maxHp: 1, speed: 0, yaw: 0, rise: 1, flash: 0, roar: 0, dying: 0, kx: 0, kz: 0, phase: 0 };
      const tall = B.height * B.scale, wide = B.radius * B.scale, CUTS = [0, 2.4, 3.9, 5.9, 8.2], END = 11.4, TOP = 9;
      const LINES = [`${B.title}. The same name as the one in the cemetery. Brothers.`, 'He was carrying a chip too. B.G. again.', 'A casino chip. Kirky knows the casino: it has all his money.', 'B.G. is the third brother. He deals.', 'The casino is in the city. The city is up a ladder.'];
      horde.corpse = body;
      const { chip, glow, ladder, shaft } = props();
      stage.visible = true;
      lamp.color.set(0xffe2b0);
      const rest = new THREE.Vector3(s.x + 0.5, floor + 0.05, s.z - 1.3);   // where the chip comes to rest
      let nextPop = 0.5;
      playDread();
      begin(END + 0.4, (t, dt) => {
        const k = (a, len) => smooth((t - a) / len), there = horde.corpse === body;
        const shot = t < CUTS[1] ? 0 : t < CUTS[2] ? 1 : t < CUTS[3] ? 2 : t < CUTS[4] ? 3 : 4;
        let lines = 0;
        dir.set(0, 0, 1); side.set(1, 0, 0);   // (from him toward Kirky; and across)
        if (there) {
          body.dying = 0.55 * k(0, 2.4);
          body.flash = Math.random() < 0.15 + 0.5 * k(0, 2.4) ? 1 : 0;
          if (t >= nextPop) { nextPop = t + 0.4 - 0.25 * k(0, 2.4); horde.gore(body, 8, 1); playBossPop(); }
        }
        once('burst', t, CUTS[1], () => { horde.gore(body, 200, 2.4); horde.corpse = null; playBossBurst(); playChipFlip(1.4); });

        // The chip: thrown clear as he bursts, spinning, down to the floor in front of Kirky.
        if (t >= CUTS[1]) {
          const f = k(CUTS[1], 1.4);
          chip.visible = true;
          chip.position.set(bx, ground + tall * 0.55, bz).lerp(rest, f);
          chip.position.y += Math.sin(f * Math.PI) * 4.5;
          chip.rotation.set((1 - f) * 22, Math.PI / 2 + t * 3 * (1 - f), 0.12 * (1 - f));   // (...the right way up for the camera)
        }
        // The way out: a ladder up the wall beside him, and street light coming down it.
        const open = k(CUTS[3] + 0.2, 1.0), climb = k(CUTS[4] + 0.5, 2.4);
        ladder.visible = shaft.visible = open > 0;
        ladder.position.set(s.x + 1.0, floor, s.z);
        shaft.position.set(s.x + 0.55, floor + TOP, s.z);
        glow.color.set(0xcfe0ff);
        glow.position.set(s.x + 0.55, floor + TOP - 1.5, s.z);
        glow.intensity = 260 * open;
        // (Kirky on the ladder, in the last shot: on its rungs, 1.2 m a second from a moment after the cut)
        const RUNG_X = s.x + 0.58, kirkyY = floor + Math.max(0, t - CUTS[4] - 0.35) * 1.2;

        if (shot === 0) {             // 1: at his feet, looking up as he comes apart
          eye.set(bx, ground + 0.5, bz).addScaledVector(dir, wide + 5.5 - 1.2 * k(0, 2.4)).addScaledVector(side, 2.2);
          target.set(bx, ground + tall * 0.55, bz);
          view(48, 0.03 + 0.1 * k(0, 2.4));
        } else if (shot === 1) {      // 2: with the chip, in the air
          eye.copy(chip.position).addScaledVector(side, 1.5).addScaledVector(dir, 1.4);
          eye.y = chip.position.y + 0.35;
          target.copy(chip.position);
          view(30, 0.005);
          lines = 0.9;
        } else if (shot === 2) {      // 3: on the floor: a snap zoom on what it says
          eye.copy(rest).addScaledVector(dir, 0.75).addScaledVector(side, 0.25);
          eye.y = rest.y + 2.1;
          target.copy(rest);
          view(54 - 20 * k(CUTS[2], 0.2), 0.003);
        } else if (shot === 3) {      // 4: from the floor, up past Kirky, as the light comes down
          eye.copy(rest).addScaledVector(dir, -1.6).addScaledVector(side, -1.6);
          eye.y = floor + 0.3;
          target.set(s.x + 0.7, floor + 1.2 + (TOP - 3) * open, s.z);
          view(56, 0.004);
        } else {                      // 5: from the top of the ladder, down it at him coming up, hand over hand
          eye.set(s.x + 0.85, floor + TOP - 0.7, s.z + 0.55);
          target.set(RUNG_X + 0.1, kirkyY + 1.25, s.z);
          view(58, 0.01);
          lines = 0.5 * climb;
        }
        // Kirky himself: on his board where he stood; then, for the last shot, off it and on the ladder with it
        // slung on his back, climbing (his climb is motion capture, kept in step with how far up he has got: a
        // rung to each hand, 0.8 m to each time round the clip).
        if (shot < 4) {
          eye.set(s.x, floor, s.z);
          model.update(dt, skater, eye, null, false);
        } else afoot(eye.set(RUNG_X, kirkyY, s.z), Math.PI / 2, 'climb', (((kirkyY - floor) / 0.8) % 1) * 0.78);   // (facing the ladder)
        horde.draw(dt);

        lamp.position.copy(camera.position).y += 1.4;
        lamp.intensity = (t >= CUTS[2] ? 70 : 260) + 300 * Math.max(...CUTS.map((c) => (t >= c ? Math.exp(-(t - c) * 5) : 0)));
        hud.lines(lines);
        hud.dread(0.4 * k(0, 1) * (1 - k(CUTS[1], 0.4)));
        hud.caption(t > 0.4 && t < END - 0.3 ? LINES[shot] : null, NEXT);
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        hud.flash('#ffffff', Math.max(pop * 0.85, k(END - 0.7, 0.7)));
        once('chip', t, CUTS[1] + 1.35, () => playChipLand());
        once('light', t, CUTS[3] + 0.2, () => playHatch());
        once('climb', t, CUTS[4] + 0.5, () => playLadder(2.4));
      }, done);
      score('deep');
      scene.skippable = true;
      scene.holds = [...CUTS.slice(1).map((c) => c - 0.03), END - 0.75];
    },

    // Out of the manhole, and up to the casino. descent: systems/descent.js (it owns the hill's casino front).
    // prime(v): load the ground round a point (the hill is too long to have all of it loaded at once).
    street(descent, prime, done) {
      const P = skater.pos.clone(), y0 = heightAt(P.x, P.z), TOP_Z = 60, at = new THREE.Vector3(), head = new THREE.Vector3(), door = new THREE.Vector3(P.x, 3, TOP_Z);
      const CUTS = [0, 3.2, 6.0, 8.2, 10.8], END = 13.4, BURST = CUTS[4] + 1.35;
      const LINES = ['Out of a manhole, into the city.', 'The DeadSlide Casino. Top of the hill, lit up like nothing is owed.', 'B.G. owes him.', 'Kirky goes to collect.', null];
      const { cover, hole } = props();
      stage.visible = cover.visible = hole.visible = true;
      hole.position.set(P.x, y0 + 0.03, P.z);
      hole.scale.setScalar(0.8);
      lamp.color.set(0xffe2b0);
      playCity(END);
      playManhole();
      begin(END + 0.3, (t, dt) => {
        const k = (a, len) => smooth((t - a) / len), shot = t < CUTS[1] ? 0 : t < CUTS[2] ? 1 : t < CUTS[3] ? 2 : t < CUTS[4] ? 3 : 4;
        once('seen', t, CUTS[1] + 0.3, () => playReveal());
        once('drag', t, CUTS[2] + 0.2, () => playInhale(1.1));
        once('push', t, CUTS[3], () => playPushOff(2.6));
        descent.stage(-95, t, 0, 0);
        const burst = k(BURST, 0.22);
        descent.doors(burst);
        // The lid: it rattles, lifts, and goes over on its back beside the hole.
        const off = k(0.6, 0.6);
        cover.position.set(P.x + 1.5 * off, y0 + 0.06 + Math.sin(off * Math.PI) * 0.7 + (t < 0.6 ? Math.abs(Math.sin(t * 30)) * 0.04 : 0), P.z);
        cover.rotation.set(0, 0, -Math.PI * off);
        cover.visible = hole.visible = shot < 4;
        // Kirky: up out of it, hand over hand as he came up the ladder, his board on his back; stood in the street;
        // then on his board, away up the hill; and at the top, straight at the doors.
        if (shot < 3) {
          const down = 1.9 * (1 - k(1.1, 1.6));
          afoot(at.set(P.x, y0 - down, P.z), 0, down > 0.5 ? 'climb' : 'breathe', down > 0.5 ? (((1.9 - down) / 0.8) % 1) * 0.78 : undefined);   // (facing up the hill)
        } else {
          aboard();
          if (shot === 3) { const z = P.z + 7 * (t - CUTS[3]) ** 2; at.set(P.x, heightAt(P.x, z), z); }
          else { const z = TOP_Z - 34 + 26 * (t - CUTS[4]); at.set(P.x, heightAt(P.x, Math.min(z, TOP_Z - 6)), z); }
          model.update(dt, skater, at, null, false);
          model.root.quaternion.multiply(spin.setFromAxisAngle(UP, Math.PI));   // (he is facing up the hill)
        }
        model.root.visible = !(shot === 4 && at.z > TOP_Z + 1);
        head.set(0, 1.66, 0).add(at);
        horde.draw(dt);
        let lines = 0;
        if (shot === 0) {             // 1: from the tarmac just down the street: the lid goes, and he comes up
          eye.set(P.x + 1.8, heightAt(P.x + 1.8, P.z - 4.5) + 0.35, P.z - 4.5);
          target.set(P.x, y0 + 1.0 + 0.5 * k(1.1, 1.3), P.z);
          view(52, t < 0.6 ? 0.01 : 0);
        } else if (shot === 1) {      // 2: over his shoulder, and a long way in on it: the casino, on top of everything
          eye.set(P.x - 2.2, y0 + 3.2, P.z - 4.5);
          target.set(P.x, y0 + 3 + (26 - y0 - 3) * k(CUTS[1], 0.3), TOP_Z);
          view(46 - 33 * k(CUTS[1] + 0.3, 0.35), 0.002);
        } else if (shot === 2) {      // 3: his face
          eye.copy(head).addScaledVector(facing(side), 1.6);   // (in front of him, whichever way that is)
          eye.x += 0.45;
          target.copy(head);
          view(34 - 8 * k(CUTS[2], 0.14), 0.004);
        } else if (shot === 3) {      // 4: behind him as he pushes off up the hill
          eye.copy(at).add(dir.set(1.2, 1.1, -4.6 - 2 * k(CUTS[3], 2.5)));
          eye.y = Math.max(eye.y, heightAt(eye.x, eye.z) + 0.5);
          target.copy(at).add(dir.set(0, 1.3, 8));
          view(60 + 12 * k(CUTS[3], 2.5), 0.03);
          lines = 1;
        } else {                      // 5: on the steps: he does not slow down
          eye.set(P.x + 6, 1.5, TOP_Z - 19 + 3 * k(CUTS[4], 2));
          target.copy(door).lerp(head, 0.35 * (1 - burst));
          view(56 - 10 * burst, 0.03 + 0.3 * burst * (1 - k(BURST + 0.3, 0.6)));
          lines = 0.8;
        }
        once('top', t, CUTS[4], () => prime(door));   // (the ground up there)
        once('burst', t, BURST, () => { playDoorsBurst(); hud.bossIntro('The House', 'B.G.'); });
        lamp.position.copy(eye).y += 1.2;
        lamp.intensity = shot === 2 ? 14 : shot === 3 ? 0 : 30;
        hud.lines(lines);
        hud.caption(LINES[shot], NEXT);
        let pop = t >= BURST ? Math.exp(-(t - BURST) * 4) : 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        hud.flash('#ffffff', Math.max(pop * 0.85, k(END - 0.8, 0.8)));
      }, () => { model.root.visible = true; hud.hideBossIntro(); done?.(); });
      score('city');
      scene.skippable = true;
      scene.holds = CUTS.slice(1).map((c) => c - 0.03);
      scene.cleanup = () => { model.root.visible = true; };
    },

    // ---- The House: Babitus's three scenes ---------------------------------------------
    // All three are cut the same way: hard cuts with a white flash on each, a snap zoom, speed lines, a close-up,
    // and the big title on the last shot.

    // "The House": you arrive. The great chandelier, then up him from his shoes to his face, his eyes, and the
    // two of you down the length of the room.
    house(b) {
      const tall = b.T.height * b.scale, wide = b.T.radius * b.scale, CUTS = [0, 1.0, 2.3, 3.3];
      b.rise = 1;
      b.posed = true;   // (he stands there: see Horde.draw)
      playDread();
      playChandelier();
      begin(5.2, (t, dt) => {
        dir.set(skater.pos.x - b.x, 0, skater.pos.z - b.z).normalize();   // (from him, toward you)
        side.set(dir.z, 0, -dir.x);
        b.yaw = Math.atan2(dir.x, dir.z);
        b.roar = 0.35 * smooth((t - 3.5) / 0.2) * (1 - smooth((t - 4.6) / 0.4));
        horde.draw(dt);
        const ground = heightAt(b.x, b.z), k = (a, len) => smooth((t - a) / len);
        let lines = 0;
        if (t < CUTS[1]) {            // 1: under the great chandelier, looking up as it swings
          eye.set(HOUSE.x + 3 * Math.sin(t * 2), 5, HOUSE.z + 9);
          target.set(HOUSE.x, 22, HOUSE.z);
          view(64 - 26 * k(0, 0.25), 0.05);
        } else if (t < CUTS[2]) {     // 2: up him, from his shoes to his face
          // (it ends level with his face, and square on to it, wherever his stance has it: b.eyesAt)
          const up = k(1.0, 1.1), face = b.eyesAt, top = face ? face.y - ground - 0.5 : tall * 0.84, fx = face ? (face.x - b.x) * up : 0, fz = face ? (face.z - b.z) * up : 0;
          eye.set(b.x + fx, ground + 0.4 + top * up, b.z + fz).addScaledVector(dir, wide + 3.6).addScaledVector(side, 0.8 - 0.8 * up);
          target.set(b.x + fx, ground + 0.5 + top * up, b.z + fz);
          view(34, 0.01);
          lines = 0.9;
        } else if (t < CUTS[3]) {     // 3: his eyes
          if (b.eyesAt) target.copy(b.eyesAt); else target.set(b.x, ground + tall * 0.89, b.z).addScaledVector(dir, wide * 0.3);
          eye.copy(target).addScaledVector(dir, wide * 0.7 + 2.6 - 0.5 * k(2.3, 1.0)).addScaledVector(side, 0.2);
          view(22, 0.008);
        } else {                      // 4: over Kirky's shoulder, the whole room between you
          eye.copy(skater.pos).addScaledVector(dir, 3.4 + 0.8 * k(3.3, 1.8)).addScaledVector(side, 1.3);
          eye.y = skater.pos.y + 1.2;
          target.set(b.x, ground + tall * 0.6, b.z);
          view(50 - 8 * k(3.3, 0.25), 0.02);
          lines = 0.5 * (1 - k(3.6, 1));
        }
        hud.lines(lines);
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        const dark = blink(t, 4.9);
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#ffffff', pop * 0.85);
        once('shoes', t, CUTS[1], () => playBones(0.4));
        once('eyes', t, CUTS[2], () => playThunder());
        once('name', t, CUTS[3], () => {
          playBossIntro();
          hud.bossIntro(b.T.title, 'The House');
          setMusicStyle('house');
        });
        if (t >= 4.9) goHome();
      });
      say(3.5, 4.6, 'The third brother. Every chip in the place has his initials on it.');
    },

    // "All in": he is down to half. His hand of cards, his eyes lighting up like reels, and the roar.
    allIn(b) {
      const tall = b.T.height * b.scale, wide = b.T.radius * b.scale, CUTS = [0, 1.0, 2.2], CARDS = 1;   // (CARDS: which hand his cards are in: see Horde's mark())
      b.posed = true;
      begin(4.2, (t, dt) => {
        dir.set(skater.pos.x - b.x, 0, skater.pos.z - b.z).normalize();
        side.set(dir.z, 0, -dir.x);
        b.yaw = Math.atan2(dir.x, dir.z);
        b.roar = smooth((t - 2.2) / 0.15) * (1 - smooth((t - 3.6) / 0.4));
        b.flash = t > 1.0 && t < 2.2 && Math.sin(t * 40) > 0 ? 1 : 0;
        horde.draw(dt);
        const ground = heightAt(b.x, b.z), k = (a, len) => smooth((t - a) / len);
        if (t < CUTS[1]) {            // 1: the cards in his hand, a snap zoom
          const cards = b.handsAt && b.handsAt[CARDS];
          if (cards) target.copy(cards); else target.set(b.x, ground + tall * 0.36, b.z).addScaledVector(side, -1.2).addScaledVector(dir, wide * 0.6);
          eye.copy(target).addScaledVector(dir, 3.3).addScaledVector(side, -0.7);
          view(46 - 22 * k(0, 0.2), 0.01);
        } else if (t < CUTS[2]) {     // 2: his eyes: 7, 7, 7
          if (b.eyesAt) target.copy(b.eyesAt); else target.set(b.x, ground + tall * 0.89, b.z).addScaledVector(dir, wide * 0.3);
          eye.copy(target).addScaledVector(dir, wide * 0.7 + 2.2).addScaledVector(side, -0.15);
          view(18, 0.012);
        } else {                      // 3: from the floor in front of him, arms up
          eye.set(b.x, ground + tall * 0.1, b.z).addScaledVector(dir, wide + 5.4 - 1.2 * k(2.2, 1.2)).addScaledVector(side, 1.5);
          target.set(b.x, ground + tall * 0.8, b.z);
          view(58 - 8 * b.roar, 0.2 * b.roar);
        }
        hud.lines(t < CUTS[1] ? 1 : t < CUTS[2] ? 0.3 : 0.9 * b.roar);
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        const reels = t > 1.0 && t < 2.2 ? 0.35 * Math.max(0, Math.sin((t - 1.0) * Math.PI * 2 * 3)) : 0;   // three gold pulses: the reels stopping
        const dark = blink(t, 3.95);
        if (dark > 0.02) hud.flash('#000', dark);
        else if (reels > pop * 0.85) hud.flash('#ffc233', reels);
        else hud.flash('#ffffff', pop * 0.85);
        once('cards', t, 0.05, () => playShuffle());
        once('reels', t, CUTS[1], () => playReelsStop());
        once('roar', t, CUTS[2], () => { playBossIntro(); playThunder(); hud.bossIntro('All in', b.T.title); });
        if (t >= 3.95) goHome();
      });
      say(2.4, 3.6, 'He puts everything on the table. Most of it was yours.');
    },

    // "Bust": he is dead. His face in slow motion, a hard cut to the wheel from above, back to him as he comes
    // apart, and then the doors.
    bust(done) {
      const p = portal.position, body = horde.corpse;
      if (!body) return done?.();
      { const after = done, at = { x: body.x, z: body.z }; done = () => this.takings(at, after); }   // (and then what was inside him)
      const tall = body.T.height * body.scale, wide = body.T.radius * body.scale, CUTS = [0, 1.5, 2.5, 3.9];
      let nextPop = 2.6;
      hud.hideBossIntro();
      begin(5.6, (t, dt) => {
        const ground = heightAt(body.x, body.z), k = (a, len) => smooth((t - a) / len);
        dir.set(skater.pos.x - body.x, 0, skater.pos.z - body.z).normalize();
        side.set(dir.z, 0, -dir.x);
        const there = horde.corpse === body;
        if (there) {
          body.dying = t < CUTS[2] ? 0.18 * k(0, 1.5) : 0.18 + 0.82 * k(2.5, 1.4);
          body.flash = t >= CUTS[2] && Math.random() < 0.2 + 0.6 * k(2.5, 1.4) ? 1 : 0;
        }
        if (t < CUTS[1]) {            // 1: his face, very slowly, as he sees the card
          if (there && body.eyesAt) target.copy(body.eyesAt); else target.set(body.x, ground + tall * 0.86, body.z).addScaledVector(dir, wide * 0.3);
          eye.copy(target).addScaledVector(dir, wide * 0.7 + 2.4 - 0.4 * k(0, 1.5)).addScaledVector(side, 0.5);
          view(22, 0.006);
        } else if (t < CUTS[2]) {     // 2: the wheel, turning: zero
          // (From over its rim, round it and in on the green pocket. Not from straight above: the great chandelier
          // hangs there, and all that can be seen through it is its own light.)
          const turn = (t - 1.5) * 0.5, zero = Math.PI * (1 / 37 - 1), out = HOUSE.pit.r * 0.62;
          target.set(HOUSE.x + Math.cos(zero) * out, 0, HOUSE.z + Math.sin(zero) * out);
          target.y = heightAt(target.x, target.z);
          eye.set(target.x + Math.cos(zero + 0.5 + turn) * 13, target.y + 9.5, target.z + Math.sin(zero + 0.5 + turn) * 13);
          view(52 - 24 * k(1.5, 0.9), 0.01);
        } else if (t < CUTS[3]) {     // 3: he comes apart
          const around = -0.5 + 0.35 * (t - 2.5);
          eye.set(body.x, 0, body.z).addScaledVector(dir, (wide + 11) * Math.cos(around)).addScaledVector(side, (wide + 11) * Math.sin(around));
          eye.y = ground + tall * 0.3;
          target.set(body.x, ground + tall * 0.5, body.z);
          view(54 - 8 * k(2.5, 1.4), 0.05 + 0.2 * k(2.5, 1.4));
          if (there && t >= nextPop) { nextPop = t + 0.3 - 0.2 * k(2.5, 1.4); horde.gore(body, 10, 1); playBossPop(); }
        } else {                      // 4: the doors, and the room starting to shake
          eye.set(HOUSE.x + 4, 3.2, HOUSE.z + 26 + 3 * k(3.9, 1.6));
          target.set(p.x, p.y + 4, p.z);
          view(52, 0.12);
        }
        once('burst', t, CUTS[3], () => {
          if (horde.corpse === body) horde.gore(body, 220, 2.6);
          horde.corpse = null;
          playBossBurst();
          hud.bossIntro('Bust', body.T.title);
        });
        horde.draw(dt);
        hud.lines(t >= CUTS[1] && t < CUTS[2] ? 0.8 : 0);
        hud.dread(t < CUTS[1] ? 0.4 * k(0, 1) : 0);
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * (c === CUTS[3] ? 3 : 8)));
        const dark = blink(t, 5.3), zero = t >= CUTS[1] && t < CUTS[2] ? 0.16 * k(2.1, 0.25) : 0;
        if (dark > 0.02) hud.flash('#000', dark);
        else if (zero > pop * 0.9) hud.flash('#3dff7a', zero);
        else hud.flash('#ffffff', pop * 0.9);
        once('wheel', t, CUTS[1], () => playThunder());
        once('doors', t, CUTS[3] + 0.5, () => playCreak(1.4));
        if (t >= 5.3) goHome();
      }, done);
    },

    // ---- The final boss arrives -------------------------------------------------
    // The sky goes dark red. From down in the grass we watch the ground split and
    // him haul himself out of it, lit by lightning. Then he is in our face, roaring,
    // his name slams across the screen and the music turns to hard rock.
    boss() {
      const b = horde.boss;
      if (!b) return;
      if (b.T.cutIn === 'skulls') return this.skullBoss(b);
      if (b.T.cutIn === 'house') return this.house(b);
      const tall = b.T.height * b.scale, wide = b.T.radius * b.scale, STRIKES = [1.1, 2.0, 2.18, 3.0];
      b.rise = 0;
      playDread();
      begin(5.1, (t, dt) => {
        // He faces you the whole time.
        dir.set(skater.pos.x - b.x, 0, skater.pos.z - b.z).normalize();
        side.set(dir.z, 0, -dir.x);
        b.yaw = Math.atan2(dir.x, dir.z);
        b.rise = Math.min(0.999, smooth((t - 0.6) / 2.3));
        b.roar = smooth((t - 3.0) / 0.2) * (1 - smooth((t - 4.2) / 0.4));
        if (t > 0.5 && t < 3) horde.erupt(b.x, b.z, wide, Math.random() < dt * 60 ? 2 : 0);   // earth flying as he breaks through
        horde.draw(dt);

        const ground = heightAt(b.x, b.z);
        if (t < 3.0) {
          // Low in the grass, creeping toward him, looking up.
          eye.set(b.x, 0, b.z).addScaledVector(dir, 19 - 4 * (t / 3)).addScaledVector(side, 4);
          eye.y = heightAt(eye.x, eye.z) + 0.6;
          target.set(b.x, ground + 0.5 + tall * 0.7 * b.rise, b.z);
          view(58, 0.02 + 0.07 * smooth((t - 0.5) / 2));
        } else {
          // Smash cut to his face as he roars.
          eye.set(b.x, 0, b.z).addScaledVector(dir, wide + 10 - 2 * smooth((t - 3) / 1.4)).addScaledVector(side, -2);
          eye.y = ground + tall * 0.5;
          target.set(b.x, ground + tall * 0.8, b.z);
          view(56 - 8 * b.roar, 0.2 * b.roar);
        }

        // Dread closing in, lightning, and blinks to black on the cuts.
        hud.dread(smooth(t / 1.2) * (1 - smooth((t - 4.3) / 0.6)));
        let bolt = 0;
        for (const s of STRIKES) if (t >= s) bolt = Math.max(bolt, Math.exp(-(t - s) * 9));
        STRIKES.forEach((s, i) => once(`strike${i}`, t, s, () => { if (i !== 2) playThunder(); }));
        const dark = Math.max(blink(t, 0), blink(t, 4.5));
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#dfe8ff', bolt * 0.8);

        once('roar', t, 3.0, () => {
          playBossIntro();
          hud.bossIntro(b.T.title);
          setMusicStyle('rock');
        });
        if (t >= 4.5) goHome();
      });
      say(3.3, 4.3, 'Hamzitus Goyitus. He buries the ones who cannot pay.');
    },

    // ---- Kill cam: you've headshot another rider (Free Ride) -----------------------------
    // Five shots, cut hard on white flashes, speed lines throughout:
    //   1. right in on your own face behind the rifle
    //   2. the muzzle, as it goes off
    //   3. the bullet's own view, tearing across the Moon toward them, slowing to a crawl as it arrives
    //   4. the hit: three snap zooms onto their head, in time with a white strobe
    //   5. from the dust, looking up at them going over, as HEADSHOT and their name slam across the screen
    // origin, aim: where the shot left the rifle and the way it went. victim(): { pos, up } of whoever was hit (they're still moving).
    headshot({ origin, aim, victim, name }) {
      const CUTS = [0, 0.4, 0.62, 1.6, 1.86], start = origin.clone(), way = aim.clone(), head = new THREE.Vector3();
      playThunder();
      begin(2.9, (t) => {
        const v = victim(), k = (a, len) => smooth((t - a) / len);
        head.copy(v.pos).addScaledVector(v.up, 1.7);
        let lines = 1, shake = 0.01;
        if (t < CUTS[1]) {            // 1: your face
          centre.copy(skater.pos).addScaledVector(skater.up, 1.62);
          eye.copy(centre).addScaledVector(way, 1.5 - 0.35 * k(0, 0.4));
          eye.y += 0.05;
          target.copy(centre);
          view(26 - 8 * k(0, 0.12));
        } else if (t < CUTS[2]) {     // 2: the muzzle
          side.crossVectors(way, UP).normalize();
          eye.copy(start).addScaledVector(side, 0.55).addScaledVector(way, -0.5);
          eye.y += 0.12;
          target.copy(start).addScaledVector(way, 2.5);
          shake = 0.05;
          view(40, shake);
        } else if (t < CUTS[3]) {     // 3: the bullet's view. Away like a shot, then slower and slower as it closes on them.
          const u = (t - CUTS[2]) / (CUTS[3] - CUTS[2]), flown = 1 - (1 - u) ** 3.2;
          dir.subVectors(head, start);
          const far = dir.length();
          dir.normalize();
          eye.copy(start).addScaledVector(dir, 2 + (far - 4.5) * flown);
          target.copy(head);
          view(70 - 42 * flown, 0.05 * (1 - flown));
          lines = 1 - 0.5 * flown;
        } else if (t < CUTS[4]) {     // 4: the hit, in three snaps
          const step = Math.min(2, Math.floor((t - CUTS[3]) / 0.085));
          dir.subVectors(head, start).normalize();
          side.crossVectors(dir, UP).normalize();
          eye.copy(head).addScaledVector(dir, -2.2).addScaledVector(side, 1.5 - step * 0.35);
          eye.y += 0.2;
          target.copy(head);
          shake = 0.07;
          view([44, 27, 15][step], shake);
        } else {                      // 5: from the dust, as they go over
          dir.subVectors(head, start).normalize();
          side.crossVectors(dir, UP).normalize();
          eye.copy(v.pos).addScaledVector(dir, 3.4 - 0.8 * k(CUTS[4], 1)).addScaledVector(side, -1.7);
          eye.y = Math.max(heightAt(eye.x, eye.z) + 0.35, v.pos.y - 0.6);
          target.copy(head);
          shake = 0.12 * Math.exp(-(t - CUTS[4]) * 4);
          view(52 - 10 * k(CUTS[4], 0.2), shake);
          lines = 0.8 * (1 - k(2.3, 0.4));
        }
        hud.lines(lines);
        // A white flash on every cut; a strobe through the hit.
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 9));
        if (t >= CUTS[3] && t < CUTS[4]) pop = Math.max(pop, Math.floor((t - CUTS[3]) / 0.085) % 2 === 0 ? 0.9 : 0.2);
        const dark = blink(t, 2.75);
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#ffffff', pop * 0.9);
        once('hit', t, CUTS[3], () => playHeadshot());
        once('name', t, CUTS[4], () => { playThunder(); hud.bossIntro(name, 'Headshot'); });
        if (t >= 2.75) goHome();
      });
    },

    // ---- A costume, found (Free Ride) ---------------------------------------------------
    // Three shots: a snap zoom onto his face; a white flash, and from down low we circle him wearing it;
    // then back and up as its name comes across. wear(): put it on him (called on the flash).
    found({ name, wear }) {
      const CUTS = [0, 0.65, 1.55];
      playDread();
      begin(2.9, (t) => {
        const k = (a, len) => smooth((t - a) / len), p = skater.pos;
        dir.copy(skater.fwd).setY(0);
        if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
        dir.normalize();
        side.set(dir.z, 0, -dir.x);
        centre.copy(p).addScaledVector(skater.up, 1.5);
        if (t < CUTS[1]) {
          eye.copy(centre).addScaledVector(dir, 2.6).addScaledVector(side, 0.5);
          target.copy(centre);
          view(58 - 38 * k(0, 0.18), 0.012);
        } else if (t < CUTS[2]) {
          const around = 0.5 + 1.5 * k(CUTS[1], 0.9);
          eye.copy(p).addScaledVector(dir, Math.cos(around) * 2.6).addScaledVector(side, Math.sin(around) * 2.6);
          eye.y = p.y + 0.45;
          target.copy(centre);
          view(46, 0.03 * (1 - k(CUTS[1], 0.5)));
        } else {
          eye.copy(p).addScaledVector(dir, 4.2 + 1.2 * k(CUTS[2], 1.2)).addScaledVector(side, -1.4);
          eye.y = p.y + 1.1 + 0.6 * k(CUTS[2], 1.2);
          target.copy(centre);
          view(48, 0);
        }
        hud.lines(t < CUTS[2] ? 0.85 : 0.5 * (1 - k(2.2, 0.5)));
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 7));
        const dark = blink(t, 2.75);
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#ffffff', pop * 0.95);
        once('wear', t, CUTS[1], () => { wear(); playPowerup(); });
        once('name', t, CUTS[2], () => { playThunder(); hud.bossIntro(name, 'Costume found'); });
        if (t >= 2.75) goHome();
      });
    },

    // ---- The Spider Queen arrives (level 2's mini-boss) ---------------------------------
    // Three shots, cut hard, each on a white flash: straight up from under her as she hangs on the roof;
    // right in on her eyes; then from down by Kirky, looking up at her, as her name comes across.
    queen() {
      const e = horde.mini;
      if (!e) return;
      const size = e.T.height * e.scale, CUTS = [0, 1.1, 2.0];
      playDread();
      begin(3.5, (t, dt) => {
        horde.draw(dt);
        const k = (a, len) => smooth((t - a) / len);
        centre.set(e.x + e.nx * size * 0.6, e.y + e.ny * size * 0.6, e.z);   // the middle of her
        dir.set(skater.pos.x - e.x, 0, skater.pos.z - e.z).normalize();       // (from her, toward you)
        if (t < CUTS[1]) {            // 1: from the floor under her
          eye.set(e.x + 1.5, heightAt(e.x, e.z) + 0.6, e.z + 2 - k(0, 1.1));
          target.copy(centre);
          view(52 - 16 * k(0, 0.2), 0.03);
        } else if (t < CUTS[2]) {     // 2: her eyes, from straight in front of her
          side.set(e.ny * e.fs, -e.nx * e.fs, e.fz).normalize();   // (the way she's facing)
          target.set(e.x + e.nx * size * 0.55, e.y + e.ny * size * 0.55, e.z).addScaledVector(side, size * 0.4);
          eye.copy(target).addScaledVector(side, 3.6 - 0.6 * k(1.1, 0.9));
          view(34, 0.012);
        } else {                      // 3: from the floor on your side of her, looking up, as her name comes across
          eye.set(e.x, 0, e.z).addScaledVector(dir, 11 - 2 * k(2.0, 1.4));
          eye.x += dir.z * 3; eye.z -= dir.x * 3;
          eye.y = heightAt(eye.x, eye.z) + 0.7;
          target.copy(centre);
          view(56 - 10 * k(2.0, 0.25), 0.05 * (1 - k(2.0, 1.2)));
        }
        lamp.position.copy(eye).y += 0.8;
        lamp.intensity = t < 3.2 ? 110 + 220 * Math.max(...CUTS.map((c) => (t >= c ? Math.exp(-(t - c) * 5) : 0))) : 0;
        hud.dread(0.4 * smooth(t / 0.5) * (1 - smooth((t - 2.9) / 0.5)));
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        const dark = blink(t, 3.2);
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#ffffff', pop * 0.85);
        once('eyes', t, CUTS[1], () => playBones(0.5));
        once('name', t, CUTS[2], () => { playThunder(); hud.bossIntro(e.T.title, 'Mini boss'); });
        if (t >= 3.2) goHome();
      });
      say(2.2, 3.0, 'The Spider Queen. She was down here before the graves were.');
    },

    // ---- Level 2's boss arrives -------------------------------------------------------
    // Four shots, cut hard, each on a white flash: bones heaping up at floor level; down the tunnel
    // over Kirky's shoulder as the heap stands up; right in on the two green lights in his skull;
    // then from under his jaw as he throws his arms up and his name slams across the screen.
    skullBoss(b) {
      const tall = b.T.height * b.scale, wide = b.T.radius * b.scale, CUTS = [0, 1.2, 2.4, 3.2];
      b.rise = 0;
      playDread();
      playBones(1.2);
      begin(5.0, (t, dt) => {
        dir.set(skater.pos.x - b.x, 0, skater.pos.z - b.z).normalize();   // (from him, toward you)
        side.set(dir.z, 0, -dir.x);
        b.yaw = Math.atan2(dir.x, dir.z);
        b.rise = Math.min(0.999, 0.45 * smooth(t / 1.2) + 0.55 * smooth((t - 1.2) / 1.0));
        b.roar = smooth((t - 3.2) / 0.15) * (1 - smooth((t - 4.3) / 0.4));
        if (t < 2.3) horde.erupt(b.x, b.z, wide, Math.random() < dt * 60 ? 2 : 0);
        horde.draw(dt);

        const ground = heightAt(b.x, b.z), k = (a, len) => smooth((t - a) / len);
        if (t < CUTS[1]) {            // 1: at his feet
          eye.set(b.x, ground + 0.35, b.z).addScaledVector(dir, wide + 3.2 - 0.6 * k(0, 1.2)).addScaledVector(side, 1.2);
          target.set(b.x, ground + 0.6 + tall * 0.25 * b.rise, b.z);
          view(40, 0.06);
        } else if (t < CUTS[2]) {     // 2: down the tunnel, over Kirky's shoulder: a snap zoom as he stands
          // (stood far enough back, and low enough, that his head and his hat are whole in the corner of the frame after the zoom: not cut off at the chin)
          eye.copy(skater.pos).addScaledVector(dir, 3.1).addScaledVector(side, 1.05);
          eye.y = skater.pos.y + 1.7;
          target.set(b.x, ground + tall * 0.55 * b.rise, b.z);
          view(62 - 30 * k(1.2, 0.22), 0.03);
        } else if (t < CUTS[3]) {     // 3: his eyes
          if (b.eyesAt) target.copy(b.eyesAt); else target.set(b.x, ground + tall * 0.87, b.z);   // (wherever his head is, as he stands now)
          eye.copy(target).addScaledVector(dir, wide * 0.7 + 3.4 - 0.5 * k(2.4, 0.8)).addScaledVector(side, 0.3);
          view(24, 0.015);
        } else {                      // 4: from under his jaw, roaring
          eye.set(b.x, ground + tall * 0.12, b.z).addScaledVector(dir, wide + 5.5 - 1.2 * k(3.2, 1.2)).addScaledVector(side, -1.6);
          target.set(b.x, ground + tall * 0.8, b.z);
          view(58 - 8 * b.roar, 0.22 * b.roar);
        }

        // Lit from the camera, a sickly green, flaring on every cut.
        lamp.position.copy(eye).y += 1.2;
        lamp.intensity = t < 4.6 ? 70 + 160 * Math.max(...CUTS.map((c) => (t >= c ? Math.exp(-(t - c) * 5) : 0))) : 0;
        hud.dread(0.55 * smooth(t / 0.8) * (1 - smooth((t - 4.3) / 0.6)));
        let pop = 0;
        for (const c of CUTS) if (t >= c) pop = Math.max(pop, Math.exp(-(t - c) * 8));
        const dark = blink(t, 4.6);
        if (dark > 0.02) hud.flash('#000', dark);
        else hud.flash('#ffffff', pop * 0.85);
        once('stand', t, CUTS[1], () => playBones(0.9));
        once('eyes', t, CUTS[2], () => playThunder());
        once('roar', t, CUTS[3], () => {
          playBossIntro();
          playBones(1.0);
          hud.bossIntro(b.T.title);
          setMusicStyle('rock');
        });
        if (t >= 4.6) goHome();
      });
      say(3.4, 4.4, 'Rubistus Goyitus. He wears the ones who could not pay.');
    },

    // ---- The boss dies, and the exit portal opens ----------------------------------
    // He doesn't just vanish. For three seconds we circle him as he comes apart:
    // shaking harder and harder, chunks bursting off him, sagging backwards, until
    // he blows to pieces in a white flash. A beat on the pieces raining down, then
    // we cut to where the portal is: the air splits, a ring of force rolls out and
    // the gate spins up to full size.
    portal(done) {
      const p = portal.position, body = horde.corpse;
      const DEATH = body ? 3.0 : 0, CUT = DEATH + 1.3, OPEN = CUT + 0.15, BACK = CUT + 2.15;   // seconds in
      const tall = body ? body.T.height * body.scale : 0, wide = body ? body.T.radius * body.scale : 0;
      let nextPop = 0.25;
      portal.group.visible = false;
      hud.hideBossIntro();   // (in case his name is still on screen from a very short fight)
      begin(BACK + 0.45, (t, dt) => {
        if (body && t < CUT) {
          // His death. The camera drifts round him, low, tightening as it goes.
          const k = Math.min(1, t / DEATH), ground = heightAt(body.x, body.z);
          dir.set(skater.pos.x - body.x, 0, skater.pos.z - body.z).normalize();
          side.set(dir.z, 0, -dir.x);
          const around = -0.45 + 0.3 * t, far = wide + 13 - 3 * k;
          eye.set(body.x, 0, body.z).addScaledVector(dir, far * Math.cos(around)).addScaledVector(side, far * Math.sin(around));
          eye.y = Math.max(heightAt(eye.x, eye.z) + 1, ground + tall * 0.3);
          target.set(body.x, ground + tall * (0.6 - 0.2 * k * k), body.z);
          const blown = t >= DEATH;
          view(58 - 8 * k, blown ? 0.5 * Math.exp(-(t - DEATH) * 3) : 0.03 + 0.2 * k * k);

          if (!blown) {
            body.dying = smooth(k);
            body.roar = 0.5 * (1 - k);
            body.flash = Math.random() < 0.15 + 0.6 * k ? 1 : 0;   // flickering red, faster and faster
            if (t >= nextPop) {                                    // chunks burst off him, more and more often
              nextPop = t + 0.42 - 0.3 * k;
              horde.gore(body, 8 + Math.floor(10 * k), 1);
              playBossPop();
            }
          }
          once('burst', t, DEATH, () => {
            horde.gore(body, 220, 2.6);
            horde.corpse = null;
            playBossBurst();
          });
          hud.dread(0.45 * (blown ? Math.exp(-(t - DEATH) * 2) : k));
        }
        horde.draw(dt);   // (his body, and the pieces of it)

        dir.set(skater.pos.x - p.x, 0, skater.pos.z - p.z).normalize();
        side.set(dir.z, 0, -dir.x);
        if (t >= CUT && t < BACK) {
          // Circling the portal slowly from a little way off.
          const around = 0.35 + 0.25 * (t - CUT);
          eye.copy(p).addScaledVector(dir, 15 * Math.cos(around)).addScaledVector(side, 15 * Math.sin(around));
          eye.y = Math.max(heightAt(eye.x, eye.z) + 1.2, p.y + 1.6);
          target.set(p.x, p.y + 3.6, p.z);
          view(52 - 6 * smooth((t - OPEN) / 1.6), 0.25 * Math.exp(-Math.max(0, t - OPEN) * 3) * (t >= OPEN ? 1 : 0));
        } else if (t >= BACK) goHome();

        once('open', t, OPEN, () => {
          hud.dread(0);
          portal.group.visible = true;
          portal.age = 0;
          horde.shockwave(p, 16, 0);     // the ring of force (it hurts nothing)
          horde.erupt(p.x, p.z, 3, 60);
          playPortalOpen();
        });
        if (t >= OPEN) portal.update(dt, { pos: camera.position });

        const dark = Math.max(blink(t, CUT), blink(t, BACK));
        if (dark > 0.02) hud.flash('#000', dark);
        else if (t >= OPEN) hud.flash('#b9ffd8', Math.exp(-(t - OPEN) * 5) * 0.9);
        else hud.flash('#fff3e6', t >= DEATH ? Math.exp(-(t - DEATH) * 4) * 0.95 : 0);   // the white flash as he bursts
      }, done);
    },

    // ---- Leaving through it --------------------------------------------------------
    // Kirky is lifted off the ground and dragged, spinning and shrinking, into the
    // middle of the gate. It flares, the screen whites out, and the level is over.
    exit(done) {
      const p = portal.position, from = renderPos.clone();
      playExit();
      begin(2.1, (t, dt) => {
        centre.set(p.x, p.y + 3.7, p.z);
        const pull = smooth(t / 1.25);
        eye.copy(from).lerp(centre, pull * pull);
        model.update(dt, skater, eye, null, false);
        model.root.quaternion.multiply(spin.setFromAxisAngle(UP, t * t * 9));
        model.root.scale.setScalar(Math.max(0.02, 1 - 0.98 * pull));

        // The gate swells as it takes him, then snaps shut.
        portal.update(dt, { pos: home.position });
        portal.gate.scale.multiplyScalar((1 + 0.7 * smooth((t - 0.9) / 0.4)) * (1 - smooth((t - 1.55) / 0.4)) + 0.001);

        // The camera stays where it was and turns to watch, pushing in.
        camera.position.copy(home.position);
        target.copy(from).setY(from.y + 1).lerp(centre, smooth(t / 0.7));
        camera.lookAt(target);
        camera.fov = home.fov + (30 - home.fov) * smooth(t / 1.6);
        camera.updateProjectionMatrix();
        hud.flash('#f2fff8', smooth((t - 1.2) / 0.6));
      }, () => {
        model.root.visible = false;
        done?.();
      });
    },
  };
}
