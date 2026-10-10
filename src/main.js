// Bootstrap + game loop: fixed-timestep physics, variable-rate rendering.
import * as THREE from 'three';
import './style.css';
import { config } from './config.js';
import { input } from './input.js';
import { buildArena } from './world/arena.js';
import { SEED } from './world/terrain.js';
import { Skater } from './player/skater.js';
import { SkaterModel } from './player/skaterModel.js';
import { ChaseCamera } from './player/chaseCamera.js';
import { Weapon } from './player/weapon.js';
import { Horde } from './enemies/horde.js';
import { unlockAudio, toggleMusic, playShot, playHit, playKill, playHurt, playTrickLand, playPickup, playLevelUp } from './fx/audio.js';
import { stats, resetStats } from './player/stats.js';
import { Xp } from './systems/xp.js';
import { rollUpgrades, takeUpgrade } from './systems/upgrades.js';
import { levelUp } from './ui/levelUp.js';
import { startMusic } from './fx/music.js';
import { hud } from './ui/hud.js';
import { createTweakPanel } from './ui/tweakPanel.js';
import { syncAudioControls } from './ui/audioControls.js';

const STEP = 1 / 240;   // physics timestep (small, because top speed is high)

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 3000);
const arena = buildArena(scene);
document.getElementById('seed').textContent = `World seed ${SEED}  (add ?seed=${SEED} to the address to revisit it)`;

const skater = new Skater();
const model = new SkaterModel(scene);
const weapon = new Weapon(scene);
const horde = new Horde(scene);
const xp = new Xp(scene);
const chase = new ChaseCamera(camera);
chase.snap(skater);

// ---- Run state: health, death, restart -------------------------------------
let hearts = config.player.hearts, invulnerable = 0, dead = false;
let pendingLevels = 0, choosing = false, trickBuff = 0;
const maxHearts = () => config.player.hearts + stats.maxHearts;
const run = { heal: (n) => { hearts = Math.min(maxHearts(), hearts + n); } };   // what upgrades may do to the run

function restart() {
  skater.respawn();
  chase.snap(skater);
  arena.prime(skater.pos);
  horde.reset();
  xp.reset();
  resetStats();
  levelUp.hide();
  pendingLevels = 0;
  choosing = false;
  trickBuff = 0;
  hearts = config.player.hearts;
  invulnerable = 0;
  dead = false;
}
const panel = createTweakPanel({ onRespawn: restart });

function hurt(amount) {
  if (invulnerable > 0 || dead) return;
  hearts -= amount;
  invulnerable = config.player.invulnerableTime + stats.invulnerable;
  chase.onSloppy();
  hud.flashHurt();
  playHurt();
  if (hearts <= 0) {
    dead = true;
    paused = true;
    document.exitPointerLock?.();
    hud.showOverlay('You died', `Survived ${hud.clock(horde.time)}  ·  wave ${horde.wave}  ·  level ${xp.level}  ·  ${horde.kills} kills  ·  click to try again`);
  }
}

// Level up: stop the game and offer three upgrades.
function offerUpgrade() {
  choosing = true;
  paused = true;
  document.exitPointerLock?.();
  playLevelUp();
  levelUp.show(xp.level - pendingLevels + 1, rollUpgrades(3), (u) => stats.taken[u.id] || 0, (upgrade) => {
    takeUpgrade(upgrade, run);
    pendingLevels--;
    if (pendingLevels > 0) return offerUpgrade();
    choosing = false;
    paused = false;
    last = performance.now();
    if (!panel.open) lockPointer();
  });
}

// ---- Pause / pointer lock ---------------------------------------------------
let paused = true;
hud.showOverlay('Deadglide', 'Click to skate');

// Pointer lock can be refused (e.g. embedded previews); the game still works without the mouse.
function lockPointer() {
  try { canvas.requestPointerLock()?.catch(() => {}); } catch {}
}
function resume() {
  if (dead) restart();
  paused = false;
  hud.hideOverlay();
  if (unlockAudio()) startMusic();
  if (!panel.open) lockPointer();
}
function pause() {
  paused = true;
  syncAudioControls();   // pick up changes made with the M key or the tuning panel
  hud.showOverlay('Paused', 'Click to resume');
}

document.getElementById('overlay').addEventListener('click', resume);
canvas.addEventListener('click', () => { if (!paused) lockPointer(); });
// Esc releases the pointer (browser behaviour); treat that as pause.
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && !paused && !panel.open) pause();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') {
    panel.toggle();
    if (panel.open) document.exitPointerLock?.();   // free the mouse for the sliders; the game keeps running
  } else if (e.code === 'Escape' && !document.pointerLockElement && !dead && !choosing) {
    paused ? resume() : pause();
  } else if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) {
    hud.popup(toggleMusic() ? 'Music on' : 'Music off', 'pending');
    syncAudioControls();
  } else if (e.code === 'Backspace' && !(e.target instanceof HTMLInputElement)) {
    restart();
  }
});

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- Loop ------------------------------------------------------------------
const renderPos = new THREE.Vector3(), aimPoint = new THREE.Vector3();
let last = performance.now(), accumulator = 0;

const kmh = (boost) => `+${Math.round(boost * 3.6)} km/h`;

// Upgrades that trigger off landing a trick.
function trickLanded() {
  if (stats.trickBuff > 0) trickBuff = stats.trickBuff;
  if (stats.shockwave > 0) horde.shockwave(skater.pos, 8, stats.shockwave);
}

function handleEvents() {
  for (const e of skater.events) {
    if (e.type === 'land') {
      chase.onLand(e.impact);
      if (e.trick) {
        hud.popup(`${e.trick}  ${kmh(e.boost)}`, 'trick');
        playTrickLand(e.boost);
        trickLanded();
      }
    } else if (e.type === 'sloppy') {
      chase.onSloppy();
      hud.popup('Sloppy landing', 'sloppy');
    } else if (e.type === 'grind') {
      hud.popup(e.trick ? `${e.trick} to grind  ${kmh(e.boost)}` : 'Grind', 'trick');
      if (e.trick) { playTrickLand(e.boost); trickLanded(); }
    } else if (e.type === 'trick') {
      hud.popup(e.name, 'pending');
    }
  }
  skater.events.length = 0;

  for (const e of horde.events) {
    if (e.type === 'wave') hud.popup(`Wave ${e.wave}`, 'alert');
    else if (e.type === 'swarm') hud.popup('Swarm!', 'alert');
    else if (e.type === 'elite') hud.popup('Something big is coming', 'alert');
    else if (e.type === 'wraiths') hud.popup('They can fly now', 'alert');
    else if (e.type === 'kill') { playKill(); xp.drop(e.x, e.y, e.z, e.xp); }
    else if (e.type === 'hit') playHit();
  }
  horde.events.length = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const [mouseDX, mouseDY] = input.takeMouse();

  if (!paused) {
    accumulator += dt;
    while (accumulator >= STEP) {
      skater.update(STEP, input);
      accumulator -= STEP;
    }

    // Draw between the last two physics states for smooth motion.
    renderPos.lerpVectors(skater.prevPos, skater.pos, accumulator / STEP);
    const { aimHeld: aiming, fireHeld: firing } = input;
    chase.update(dt, skater, renderPos, mouseDX, mouseDY, aiming);
    camera.updateMatrixWorld();

    // Monsters: spawn, chase, and claw at the player.
    invulnerable = Math.max(0, invulnerable - dt);
    const damage = horde.update(dt, skater);
    if (damage > 0) hurt(damage);

    // Gun: the arm points at whatever is under the crosshair, bullets fly there.
    weapon.aimPoint(camera, aimPoint);
    model.update(dt, skater, renderPos, aimPoint, aiming || firing, invulnerable);
    trickBuff = Math.max(0, trickBuff - dt);
    const airborne = !skater.grounded && !skater.grinding;
    const damageMult = (airborne ? stats.airDamage : 1) * (trickBuff > 0 ? 2 : 1);
    if (weapon.update(dt, firing, aiming, model.muzzle, aimPoint, horde, damageMult)) {
      model.onShot();
      chase.onShot();
      playShot();
    }

    handleEvents();

    // XP: gems fly in, and enough of them means an upgrade.
    const gain = xp.update(dt, skater);
    if (gain.collected) playPickup();
    pendingLevels += gain.levels;
    if (pendingLevels > 0 && !choosing && !dead) offerUpgrade();

    arena.update(dt, renderPos);
    hud.update(skater, aiming, hearts, horde, xp, maxHearts());
  }
  renderer.render(scene, camera);
}

chase.update(0, skater, skater.pos, 0, 0, false);
model.update(0, skater, skater.pos, null, false, 0);
arena.prime(skater.pos);
arena.update(0, skater.pos);
hud.update(skater, false, hearts, horde, xp, maxHearts());
requestAnimationFrame(frame);

// Handy in the browser console: game.skater, game.config, game.horde
window.game = { skater, config, chase, weapon, horde, xp, stats, input, restart, seed: SEED };
