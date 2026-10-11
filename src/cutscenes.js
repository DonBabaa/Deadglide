// Cutscenes: short moments where the game stops and the camera goes somewhere
// else. While one plays, main.js runs nothing but cutscenes.update().
//   boss()    the final boss claws his way out of the ground
//   portal()  the boss dies, then the exit portal tears open
//   exit()    Kirky is pulled through it
// Each is a function of time: `step(t, dt)` places the camera and moves the
// few things that are allowed to move, and `done` runs when it's over.
import * as THREE from 'three';
import { heightAt } from './world/terrain.js';
import { hud } from './ui/hud.js';
import { playBones, playDread, playThunder, playBossIntro, playPortalOpen, playExit, playBossBurst, playBossPop } from './fx/audio.js';
import { setMusicStyle } from './fx/music.js';

const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const UP = new THREE.Vector3(0, 1, 0);
const eye = new THREE.Vector3(), target = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3(), centre = new THREE.Vector3();
const spin = new THREE.Quaternion();

export function createCutscenes({ camera, model, skater, horde, portal, renderPos }) {
  let scene = null;   // the one playing: { time, duration, step, done, marks }
  const home = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 0 };   // where the camera was

  // A light the camera can carry, for scenes shot somewhere dark (the Catacombs). Off unless a scene turns it on.
  const lamp = new THREE.PointLight(0xd8ffd0, 0, 70, 1.4);
  model.root.parent.add(lamp);

  function begin(duration, step, done) {
    home.position.copy(camera.position);
    home.quaternion.copy(camera.quaternion);
    home.fov = camera.fov;
    scene = { time: 0, duration, step, done, marks: {} };
    document.body.classList.add('cutscene');
  }

  function finish(completed) {
    const { done } = scene;
    scene = null;
    lamp.intensity = 0;
    document.body.classList.remove('cutscene');
    hud.flash(null);
    hud.dread(0);
    model.root.scale.setScalar(1);
    if (horde.boss) { horde.boss.rise = 1; horde.boss.roar = 0; }
    horde.corpse = null;
    if (completed) done?.();
  }

  // Put the camera at `eye` looking at `target`, shaking by up to `shake` metres.
  function view(fov, shake = 0) {
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
  // Run `fn` once, the first time the cutscene's clock passes `at`.
  const once = (name, t, at, fn) => { if (t >= at && !scene.marks[name]) { scene.marks[name] = true; fn(); } };
  // A blink to black around a hard cut at `at` (0..1).
  const blink = (t, at) => 1 - smooth(Math.abs(t - at) / 0.16);

  return {
    get active() { return scene !== null; },
    // Jump the one that is playing to `seconds` in (handy when testing from the console).
    seek(seconds) { if (scene) scene.time = seconds; },

    update(dt) {
      scene.time += dt;
      scene.step(scene.time, dt);
      if (scene && scene.time >= scene.duration) finish(true);
    },

    // Stop whatever is playing without its ending (the run is being reset).
    cancel() { if (scene) finish(false); },

    // ---- The final boss arrives -------------------------------------------------
    // The sky goes dark red. From down in the grass we watch the ground split and
    // him haul himself out of it, lit by lightning. Then he is in our face, roaring,
    // his name slams across the screen and the music turns to hard rock.
    boss() {
      const b = horde.boss;
      if (!b) return;
      if (b.T.cutIn === 'skulls') return this.skullBoss(b);
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
          eye.copy(skater.pos).addScaledVector(dir, 2.6).addScaledVector(side, 0.9);
          eye.y = skater.pos.y + 1.9;
          target.set(b.x, ground + tall * 0.55 * b.rise, b.z);
          view(62 - 30 * k(1.2, 0.22), 0.03);
        } else if (t < CUTS[3]) {     // 3: his eyes
          eye.set(b.x, ground + tall * 0.87, b.z).addScaledVector(dir, wide + 3.4 - 0.5 * k(2.4, 0.8)).addScaledVector(side, 0.3);
          target.set(b.x, ground + tall * 0.87, b.z);
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
