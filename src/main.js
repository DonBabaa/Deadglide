// Bootstrap + game loop: fixed-timestep physics, variable-rate rendering.
// The game is either on the main menu or in a run.
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
import { WEAPONS } from './player/weapons.js';
import { Score } from './systems/score.js';
import { Horde } from './enemies/horde.js';
import { unlockAudio, toggleMusic, playShot, playHit, playKill, playHurt, playTrickLand, playPickup, playLevelUp, playChest, playHeadshot, playSwitch, playHeal, playSniper, playPowerup, playShieldHit } from './fx/audio.js';
import { stats, resetStats } from './player/stats.js';
import { Xp } from './systems/xp.js';
import { Loot } from './systems/loot.js';
import { HotBox } from './systems/hotbox.js';
import { Powerups, POWERUPS } from './player/powerups.js';
import { UPGRADES, rollUpgrades, takeUpgrade } from './systems/upgrades.js';
import { levelUp } from './ui/levelUp.js';
import { startMusic } from './fx/music.js';
import { hud } from './ui/hud.js';
import { createTweakPanel } from './ui/tweakPanel.js';
import { syncAudioControls } from './ui/audioControls.js';
import { MenuScene } from './menu/menuScene.js';
import { menu } from './menu/menu.js';

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
const loot = new Loot(scene);
const score = new Score();
const hotbox = new HotBox(scene);
const powerups = new Powerups(scene);
const chase = new ChaseCamera(camera);
const menuScene = new MenuScene(scene, camera);

// ---- Run state: health, death, restart -------------------------------------
let inMenu = true;        // on the main menu (true) or in a run (false)
let creative = null;      // the Creative-mode loadout for this run, or null for a normal run
let hp = config.player.maxHp, invulnerable = 0, dead = false;
let pendingLevels = 0, choosing = false, trickBuff = 0, shield = 0;
const maxHp = () => config.player.maxHp + stats.maxHp;
const run = { heal: (n) => { hp = Math.min(maxHp(), hp + n); } };   // what upgrades may do to the run
// What chest items may do (see systems/loot.js).
const items = {
  heal: run.heal,
  isHurt: () => hp < maxHp(),
  addXp: (n) => { xp.xp += n * stats.xpGain; },
  magnet: () => xp.pullAll(),
  blast: (radius, damage) => horde.shockwave(skater.pos, radius, damage),
  freeUpgrade: () => { pendingLevels++; freeUpgrades++; },
  frenzy: (seconds) => { stats.frenzy = seconds; },
  shield: (seconds) => { shield = seconds; },
  hasWeapon: (id) => weapon.has(id),
  giveWeapon: (id) => { weapon.give(id); weaponChanged(); },
};

function weaponChanged() {
  model.setWeapon(weapon.def);
  hud.weapons(weapon, WEAPONS);
  playSwitch();
}
let freeUpgrades = 0;   // upgrade picks that didn't come from levelling up

// Start the run again from scratch (keeping the same Creative loadout, if any).
function restart() {
  skater.respawn();
  chase.snap(skater);
  arena.prime(skater.pos);
  horde.reset();
  xp.reset();
  loot.reset();
  hotbox.reset();
  powerups.reset();
  score.reset();
  weapon.reset();
  shield = 0;
  freeUpgrades = 0;
  resetStats();
  levelUp.hide();
  pendingLevels = 0;
  choosing = false;
  trickBuff = 0;
  invulnerable = 0;
  dead = false;

  // Creative mode: hand over the chosen guns and upgrades.
  if (creative) {
    for (const id of creative.weapons) weapon.give(id);
    for (const u of UPGRADES) for (let n = 0; n < (creative.upgrades[u.id] || 0); n++) takeUpgrade(u, run);
  }
  config.horde.enabled = creative ? creative.monsters : true;
  hp = maxHp();
  model.setWeapon(weapon.def);
  hud.weapons(weapon, WEAPONS);
}
const panel = createTweakPanel({ onRespawn: () => { if (!inMenu) restart(); } });

function hurt(amount) {
  if (invulnerable > 0 || shield > 0 || dead || creative?.noDamage) return;
  if (powerups.absorb(amount)) {   // the HotBox shield takes it
    invulnerable = config.player.invulnerableTime + stats.invulnerable;
    playShieldHit();
    return;
  }
  hp = Math.max(0, hp - amount);
  invulnerable = config.player.invulnerableTime + stats.invulnerable;
  chase.onSloppy();
  hud.flashHurt();
  playHurt();
  score.onHurt();
  if (hp <= 0) {
    dead = true;
    paused = true;
    document.exitPointerLock?.();
    const record = !creative && score.finish();   // Creative runs don't count toward your best
    const standing = creative ? 'Creative mode' : record ? 'new best!' : `best ${score.best.toLocaleString()}`;
    hud.showOverlay('You died', `Score ${Math.floor(score.points).toLocaleString()}  ·  ${standing}
Survived ${hud.clock(horde.time)}  ·  wave ${horde.wave}  ·  level ${xp.level}  ·  ${horde.kills} kills  ·  top multiplier x${score.topMultiplier}  ·  best streak ${score.bestStreak}
Click to try again`);
  }
}

// Level up: stop the game and offer three upgrades.
function offerUpgrade() {
  choosing = true;
  paused = true;
  document.exitPointerLock?.();
  playLevelUp();
  const fromLevels = pendingLevels - freeUpgrades;   // level-ups are offered first, then any free picks
  const title = fromLevels > 0 ? `Level ${xp.level - fromLevels + 1}` : 'Old Tome';
  if (fromLevels <= 0) freeUpgrades--;
  levelUp.show(title, rollUpgrades(3), (u) => stats.taken[u.id] || 0, (upgrade) => {
    takeUpgrade(upgrade, run);
    pendingLevels--;
    if (pendingLevels > 0) return offerUpgrade();
    choosing = false;
    paused = false;
    last = performance.now();
    if (!panel.open) lockPointer();
  });
}

// ---- Menu <-> run ------------------------------------------------------------
let paused = true;

// Pointer lock can be refused (e.g. embedded previews); the game still works without the mouse.
function lockPointer() {
  try { canvas.requestPointerLock()?.catch(() => {}); } catch {}
}

function showMenu() {
  inMenu = true;
  paused = true;
  document.exitPointerLock?.();
  hud.hideOverlay();
  levelUp.hide();
  horde.reset();
  loot.reset();
  hotbox.reset();
  powerups.reset();
  xp.reset();
  horde.update(0, skater);          // (these three just redraw, now that everything is cleared)
  xp.update(0, skater);
  loot.update(0, skater, items);
  hud.chestMarker(null);
  hud.zoneMarker(null);
  hud.capture(null);
  hud.scope(false);
  model.setVisible(false);
  menuScene.setVisible(true);
  menu.show(score.best);
}

// From the menu's Start button. `loadout` is the Creative setup, or null.
menu.onStart((loadout) => {
  creative = loadout;
  inMenu = false;
  menu.hide();
  menuScene.setVisible(false);
  model.setVisible(true);
  restart();
  paused = false;
  last = performance.now();
  if (unlockAudio()) startMusic();
  lockPointer();
});
// Any click on the menu is enough for the browser to let the music start.
document.getElementById('menu').addEventListener('click', () => { if (unlockAudio()) startMusic(); });

// ---- Pause -------------------------------------------------------------------
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
document.getElementById('to-menu').addEventListener('click', (e) => {
  e.stopPropagation();   // not a "click to resume"
  showMenu();
});
canvas.addEventListener('click', () => { if (!paused) lockPointer(); });
// Esc releases the pointer (browser behaviour); treat that as pause.
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && !paused && !panel.open) pause();
});
window.addEventListener('keydown', (e) => {
  if (inMenu) return;
  if (e.code === 'Backquote') {
    panel.toggle();
    if (panel.open) document.exitPointerLock?.();   // free the mouse for the sliders; the game keeps running
  } else if (e.code === 'Escape' && !document.pointerLockElement && !dead && !choosing) {
    paused ? resume() : pause();
  } else if (/^Digit[1-9]$/.test(e.code) && !paused && !e.defaultPrevented) {
    if (weapon.equipSlot(Number(e.code.slice(5)) - 1)) weaponChanged();   // number keys pick a gun
  } else if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) {
    hud.popup(toggleMusic() ? 'Music on' : 'Music off', 'pending');
    syncAudioControls();
  } else if (e.code === 'Backspace' && !(e.target instanceof HTMLInputElement)) {
    restart();
  }
});

// Mouse wheel cycles through your guns.
window.addEventListener('wheel', (e) => {
  if (!paused && weapon.cycle(e.deltaY > 0 ? 1 : -1)) weaponChanged();
}, { passive: true });

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- Loop ------------------------------------------------------------------
const renderPos = new THREE.Vector3(), aimPoint = new THREE.Vector3(), marker = new THREE.Vector3();
let last = performance.now(), accumulator = 0;

const kmh = (boost) => `+${Math.round(boost * 3.6)} km/h`;

// Where a world position sits on screen, as fractions 0..1, pinned to the edge if it's off screen or behind you.
function onScreen(pos, lift) {
  marker.copy(pos).setY(pos.y + lift).project(camera);
  const behind = marker.z > 1;   // behind the camera: the projection is mirrored
  const mx = Math.max(-0.92, Math.min(0.92, behind ? -marker.x : marker.x));
  const my = Math.max(-0.8, Math.min(0.72, behind ? -1 : marker.y));
  return [mx * 0.5 + 0.5, 0.5 - my * 0.5];
}

// Upgrades that trigger off landing a trick.
function trickLanded() {
  if (stats.trickBuff > 0) trickBuff = stats.trickBuff;
  if (stats.shockwave > 0) horde.shockwave(skater.pos, 8, stats.shockwave);
}

const airborne = () => !skater.grounded && !skater.grinding;

function handleEvents() {
  for (const e of skater.events) {
    if (e.type === 'land') {
      chase.onLand(e.impact);
      if (e.trick) {
        hud.popup(`${e.trick}  ${kmh(e.boost)}`, 'trick');
        playTrickLand(e.boost);
        trickLanded();
        score.trick(e.boost);
      }
    } else if (e.type === 'sloppy') {
      chase.onSloppy();
      hud.popup('Sloppy landing', 'sloppy');
    } else if (e.type === 'grind') {
      hud.popup(e.trick ? `${e.trick} to grind  ${kmh(e.boost)}` : 'Grind', 'trick');
      if (e.trick) { playTrickLand(e.boost); trickLanded(); score.trick(e.boost); }
    } else if (e.type === 'grindEnd') {
      score.grind(e.distance);
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
    else if (e.type === 'kill') {
      playKill();
      if (e.headshot) playHeadshot();
      if (!e.quiet) hud.hitMarker('kill');
      xp.drop(e.x, e.y, e.z, e.xp);
      loot.maybeDrop(e);
      const milestone = score.kill(e.score, { elite: e.elite, headshot: e.headshot, airborne: airborne() });
      if (milestone) hud.popup(`${milestone}!`, 'alert');
    } else if (e.type === 'hit') {
      e.headshot ? playHeadshot() : playHit();
      hud.hitMarker(e.headshot ? 'crit' : 'hit');
    }
  }
  horde.events.length = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const [mouseDX, mouseDY] = input.takeMouse();

  if (inMenu) {
    menuScene.update(dt);
    arena.update(dt, menuScene.origin);
    renderer.render(scene, camera);
    return;
  }

  if (!paused) {
    accumulator += dt;
    while (accumulator >= STEP) {
      skater.update(STEP, input);
      accumulator -= STEP;
    }

    // Draw between the last two physics states for smooth motion.
    renderPos.lerpVectors(skater.prevPos, skater.pos, accumulator / STEP);
    const { aimHeld: aiming, fireHeld: firing } = input;
    const scoped = aiming && !!weapon.def.scope;
    chase.update(dt, skater, renderPos, mouseDX, mouseDY, aiming, scoped);
    hud.scope(scoped && chase.scope > 0.35);
    camera.updateMatrixWorld();

    // Monsters: spawn, chase, and claw at the player.
    invulnerable = Math.max(0, invulnerable - dt);
    const damage = horde.update(dt * (powerups.active('slow') ? config.powerups.slowFactor : 1), skater);   // Couch Lock slows their whole world down
    if (damage > 0) hurt(damage);

    // Gun: the arm points at whatever is under the crosshair, bullets fly there.
    weapon.aimPoint(camera, aimPoint);
    model.update(dt, skater, renderPos, aimPoint, aiming || firing, invulnerable, chase.scope > 0.4);
    trickBuff = Math.max(0, trickBuff - dt);
    if (powerups.active('blaze')) stats.frenzy = Math.max(stats.frenzy, powerups.time.blaze);   // Blaze: double fire rate...
    const damageMult = (airborne() ? stats.airDamage : 1) * (trickBuff > 0 ? 2 : 1) * (powerups.active('blaze') ? 2 : 1);   // ...and double damage
    if (weapon.update(dt, firing, aiming, model.muzzle, aimPoint, horde, damageMult)) {
      model.onShot();
      chase.onShot(weapon.def.kick);
      if (weapon.def.beam) {
        playSniper();
        hud.scopeFlash();
      } else playShot(weapon.def.pitch, weapon.def.loud);
    }

    handleEvents();
    score.update(dt, skater.speed);
    hud.score(score);
    hud.streak(score, config.score.streakWindow);

    // Chests: ride over one to open it.
    stats.frenzy = Math.max(0, stats.frenzy - dt);
    shield = Math.max(0, shield - dt);
    const { item, healed } = loot.update(dt, skater, items);
    if (healed) {
      hud.flashHeal();
      playHeal();
    }
    if (item) {
      hud.popup(item.weapon ? `New weapon: ${item.name}` : `${item.name}: ${item.description}`, 'loot');
      playChest();
    }

    // Marker for the nearest chest, pinned to the screen edge if it's off screen.
    const chest = loot.nearest(skater.pos);
    if (chest) hud.chestMarker(...onScreen(chest, 2.5), chest.distanceTo(skater.pos));
    else hud.chestMarker(null);

    // HotBox Zone: stand in it to fill the bar and win its power-up.
    const box = hotbox.update(dt, skater);
    if (box.zone && !box.captured) {
      hud.zoneMarker(...onScreen(box.zone, 6), Math.hypot(box.zone.x - skater.pos.x, box.zone.z - skater.pos.z));
      hud.capture(box.zone.progress > 0 ? box.zone.progress : null);
    } else {
      hud.zoneMarker(null);
      hud.capture(null);
    }
    if (box.captured) {
      const won = powerups.random();   // you only find out what was in it now
      powerups.grant(won);
      hud.popup(`${POWERUPS[won].name}: ${POWERUPS[won].description}`, 'loot');
      playPowerup();
      score.add(250, 0.5);
    }
    powerups.update(dt, renderPos, horde, run);
    stats.gravity = powerups.active('float') ? config.powerups.floatGravity : 1;   // Moon Rocks
    hud.shielded(powerups.active('shield'));

    // XP: gems fly in, and enough of them means an upgrade.
    const gain = xp.update(dt, skater);
    if (gain.collected) playPickup();
    pendingLevels += gain.levels;
    if (pendingLevels > 0 && !choosing && !dead) offerUpgrade();

    arena.update(dt, renderPos);
    hud.update(skater, aiming, hp, horde, xp, maxHp(), { 'Frenzy': powerups.active('blaze') ? 0 : stats.frenzy, 'Invincible': shield, 'Double damage': trickBuff, ...powerups.running() });
  }
  renderer.render(scene, camera);
}

// Start on the main menu.
arena.prime(skater.pos);
hud.update(skater, false, hp, horde, xp, maxHp(), {});
hud.weapons(weapon, WEAPONS);
hud.score(score);
showMenu();
requestAnimationFrame(frame);

// Handy in the browser console: game.skater, game.config, game.horde
window.game = { skater, config, chase, weapon, horde, xp, loot, score, hotbox, powerups, stats, input, restart, showMenu, seed: SEED };
