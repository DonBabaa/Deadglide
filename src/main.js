// Bootstrap + game loop: fixed-timestep physics, variable-rate rendering.
// The game is either on the main menu or in a run.
import * as THREE from 'three';
import './style.css';
import './ui/keys.js';
import { config } from './config.js';
import { input } from './input.js';
import { buildArena } from './world/arena.js';
import { SEED, setLevel } from './world/terrain.js';
import { LEVELS } from './world/level.js';
import { HOUSE, houseSpot } from './world/house.js';
import { MOON, ventAt, lavaAt, LAVA_LAKE, GEYSER, HOOPS, domeAt } from './world/moon.js';
import { Lines } from './systems/lines.js';
import { createRide } from './freeride/ride.js';
import { createTargets } from './freeride/targets.js';
import { createEggs } from './freeride/eggs.js';
import { COSTUMES } from './player/costumes.js';
import { owns, award, slot } from './systems/cosmetics.js';
import { TRICKS } from './player/tricks.js';
import { Skater } from './player/skater.js';
import { SkaterModel } from './player/skaterModel.js';
import { ChaseCamera } from './player/chaseCamera.js';
import { Weapon } from './player/weapon.js';
import { WEAPONS } from './player/weapons.js';
import { Score } from './systems/score.js';
import { Horde } from './enemies/horde.js';
import { unlockAudio, toggleMusic, playShot, playHit, playKill, playKillNote, playAir, setRide, playHurt, playTrickLand, playPickup, playLevelUp, playChest, playHeadshot, playSwitch, playHeal, playSniper, playPowerup, playShieldHit, playBossThrow, playBones, playClang, setFlame, setSpace, holdMusic, playGhostTell, playGhostThrow, playZone, playVent, playRadio, playAlien, playGolden, playSplat, playBossDeath, playPortal, playDrag } from './fx/audio.js';
import { stats, resetStats } from './player/stats.js';
import { Xp } from './systems/xp.js';
import { Loot } from './systems/loot.js';
import { HotBox } from './systems/hotbox.js';
import { Gold } from './systems/gold.js';
import { profile, applyPermanent, hasUnlock, gunUnlocked, bank, reach, clear, finished } from './systems/profile.js';
import { shop } from './menu/shop.js';
import { currentLook } from './systems/cosmetics.js';
import { Portal } from './systems/portal.js';
import { Powerups, POWERUPS } from './player/powerups.js';
import { UPGRADES, rollUpgrades, takeUpgrade, describe } from './systems/upgrades.js';
import { levelUp } from './ui/levelUp.js';
import { startMusic } from './fx/music.js';
import { hud } from './ui/hud.js';
import { createRideFx } from './fx/rideFx.js';
import { createTweakPanel } from './ui/tweakPanel.js';
import { syncAudioControls } from './ui/audioControls.js';
import { MenuScene } from './menu/menuScene.js';
import { menu } from './menu/menu.js';
import { leaderboard } from './ui/leaderboard.js';
import { getName } from './ui/playerName.js';
import { goldTally } from './ui/goldTally.js';
import { DESCENT, descentHeight } from './world/descent.js';
import { load, store } from './systems/storage.js';
import { createCutscenes } from './cutscenes.js';
import { createCasino } from './casino/casino.js';
import { createDescent } from './systems/descent.js';
import { runTime as hillTime } from './ui/leaderboard.js';
import { createEmoter } from './player/emotes.js';
import { createEmoteWheel } from './ui/emoteWheel.js';
import { setMusicStyle, MUSIC_STYLES } from './fx/music.js';
import * as SOUNDS from './fx/audio.js';
import { createModelViewer } from './ui/modelViewer.js';
import { playCue, stopCue } from './fx/score.js';
import { loadRealMobs } from './enemies/realMobs.js';
import { loadMobAnims } from './enemies/mobAnims.js';

await Promise.all([loadRealMobs(), loadMobAnims()]);   // the monsters made in Blender take the place of the built ones before anything is made of them

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
const gold = new Gold(scene);
const portal = new Portal(scene);
const lines = new Lines();   // Free Ride's score
// Free Ride with friends (see freeride/ride.js). It asks for our state about twelve times a second.
let gunIsUp = false;
const ride = createRide({
  scene,
  myName: () => getName() || 'Kirky',
  myLook: () => { const { goldGuns, ...look } = currentLook(); return look; },
  me: () => ({
    x: skater.pos.x, y: skater.pos.y, z: skater.pos.z, vx: skater.vel.x, vy: skater.vel.y, vz: skater.vel.z,
    fx: skater.fwd.x, fy: skater.fwd.y, fz: skater.fwd.z, ux: skater.up.x, uy: skater.up.y, uz: skater.up.z,
    flip: skater.flip, speed: skater.speed, ground: skater.grounded ? 1 : 0, grind: skater.grinding ? 1 + skater.grindStyle : 0,   // (0: not grinding; otherwise which grind, plus one)
    trick: skater.trick ? TRICKS.indexOf(skater.trick) : -1, tp: skater.trickProgress, charge: skater.charge, steer: skater.steer,
    ax: aimPoint.x, ay: aimPoint.y, az: aimPoint.z, gun: gunIsUp ? 1 : 0, line: lines.total, best: lines.session,
    safe: LEVELS[level].freeRide ? Math.max(0, invulnerable) : 0, emote: emoter.playing,
  }),
  onChange: () => {},
});
// Free Ride's targets (see freeride/targets.js). A kill goes on your line: the target's points, times everything
// that made the shot hard.
const targets = createTargets({
  scene, ride,
  burst: (at, velocity, count) => weapon.burst(at, velocity, count),
  onKill({ kind, head, dist, points, shot }) {
    const F = config.freeRide, bonus = [];
    let worth = points * (1 + (dist / 100) * F.perHundredMetres);
    if (head) { worth *= F.headshot; bonus.push('headshot'); }
    if (shot.trick) { worth *= F.trickShot; bonus.push('trick shot'); }
    else if (shot.air) { worth *= F.airborne; bonus.push('airborne'); }
    if (!shot.scoped) { worth *= F.noScope; bonus.push('no scope'); }
    const what = kind === 'golden' ? 'The golden one' : kind === 'drifter' ? 'Alien' : 'Astronaut';
    lines.add(`${what} ${Math.round(dist)} m${bonus.length ? `, ${bonus.join(', ')}` : ''}`, worth);
    hud.popup(`${head ? 'Headshot' : what}  ${Math.round(dist)} m${bonus.filter((b) => b !== 'headshot').map((b) => `  \u00b7  ${b}`).join('')}`, head || kind === 'golden' ? 'loot' : 'trick');
    hud.hitMarker('kill');
    playKill();
    if (kind === 'golden') playGolden(); else if (kind === 'drifter') playAlien(); else playRadio();
    if (head) playHeadshot();
  },
});
ride.onGame = (from, message) => targets.onGame(from, message);
// Another rider has shot you: nothing is hurt, but you're off your board, your line is gone, and for a moment you can't be shot again.
ride.onHit = (by, head) => {
  if (!LEVELS[level].freeRide || invulnerable > 0) return;
  invulnerable = config.freeRide.safeAfterHit;
  lines.fail(`Shot by ${by}`);
  skater.vel.multiplyScalar(0.2);
  if (skater.rail) skater.leaveRail();
  if (skater.ceiling) skater.dropCeiling();
  if (skater.grounded) { skater.vel.y = 5; skater.takeoff(); }
  chase.onSloppy();
  hud.flashHurt();
  hud.popup(head ? `Headshot by ${by}` : `Shot by ${by}`, 'sloppy');
  playHurt();
};
// The Moon's secrets (freeride/eggs.js: spoilers). Winning a costume gives you both its pieces, and puts them on.
const descent = createDescent({ scene, skater });   // the Long Way Down: the collapse, the ghosts and the clock
const eggs = createEggs({
  scene, skater,
  ghosts: () => ride.ghosts,
  has: (id) => owns(slot('outfit'), slot('outfit').options.find((o) => o.id === id)),
  onFound(id) {
    for (const s of ['outfit', 'mask']) award(slot(s), slot(s).options.find((o) => o.id === id));
    cutscenes.found({ name: COSTUMES[id].name, wear: applyLook });
  },
});
const powerups = new Powerups(scene);
const chase = new ChaseCamera(camera);
const menuScene = new MenuScene(scene, camera);

// ---- Run state: health, death, restart -------------------------------------
let inMenu = true;        // on the main menu (true) or in a run (false)
let level = 1;            // the level the world is built for: 1 = the Cemetery, 2 = the Catacombs
// Rebuild the world for a level (the menu's backdrop is always the Cemetery).
function setWorld(n) {
  if (n === level) return;
  level = n;
  setSpace({ 2: 'cave', 3: 'moon', 4: 'hall' }[n] || 'open');   // (what the place sounds like)
  setLevel(n);
  arena.setLevel(n);
}
let creative = null;      // the Creative-mode loadout for this run, or null for a normal run
let hp = config.player.maxHp, invulnerable = 0, dead = false;
let won = false;          // through the exit portal: the level is complete
let secondChance = false; // the Second Chance unlock, not yet used this run
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
  weaponUnlocked: (id) => !!creative || gunUnlocked(id),   // (Creative mode has every gun)
  giveWeapon: (id) => { weapon.give(id); weaponChanged(); },
};

function weaponChanged() {
  model.setWeapon(weapon.def);
  hud.weapons(weapon, WEAPONS);
  playSwitch();
}
let freeUpgrades = 0;   // upgrade picks that didn't come from levelling up
let drinkWait = 0;      // the House: seconds until the barman puts another drink out (0: there is one waiting)

// Start the run again from scratch (keeping the same Creative loadout, if any).
// carry: arriving from the level before: your guns, upgrades, power-ups, XP and score come with you.
function restart(carry = false) {
  rideFx.reset();
  offer(0);
  skater.respawn();
  chase.snap(skater);
  arena.prime(skater.pos);
  horde.reset();
  gold.reset();
  loot.reset();
  hotbox.reset();
  portal.reset();
  hud.boss(null);
  hud.hideBossIntro();
  hud.escape(null);
  hud.portalMarker(null);
  won = false;
  shield = 0;
  if (!carry) {
    xp.reset();
    powerups.reset();
    score.reset();
    weapon.reset();
    freeUpgrades = 0;
    resetStats();
  }
  powerInfo.classList.add('hidden');
  if (drag) endDrag(false);
  cutscenes.cancel();
  goldTally.hide();
  setMusicStyle({ 2: 'catacombs', 3: 'moon', 4: 'house', 5: 'hill' }[level] || 'dnb');   // (each level has its own: fx/music.js)
  model.root.scale.setScalar(1);
  leaderboard.hideEnd();
  levelUp.hide();
  if (!carry) pendingLevels = 0;
  choosing = false;
  trickBuff = 0;
  invulnerable = 0;
  dead = false;

  // Creative mode: hand over the chosen guns and upgrades.
  if (creative && !carry) {
    for (const id of creative.weapons) weapon.give(id);
    for (const u of UPGRADES) for (let n = 0; n < (creative.upgrades[u.id] || 0); n++) takeUpgrade(u, run);
    for (const id in creative.powers) for (let n = 0; n < creative.powers[id]; n++) powerups.grant(id);
  }
  // A normal run: everything bought in the shop comes with you.
  if (!carry) secondChance = !creative && hasUnlock('secondChance');
  if (!creative && !carry) {
    applyPermanent(stats);
    if (profile.startGun) weapon.give(profile.startGun);
    if (hasUnlock('headStart')) powerups.grant(powerups.random());
  }
  config.horde.enabled = creative ? creative.monsters : true;
  // Free Ride (the Moon): everyone is equal. No upgrades or power-ups, nothing can hurt you, nothing to
  // fight (yet), and the only gun is the sniper.
  document.body.classList.toggle('free-ride', !!LEVELS[level].freeRide);
  lines.reset();
  hud.line(LEVELS[level].freeRide ? lines : null);
  targets.reset();
  targets.setVisible(!!LEVELS[level].freeRide);
  eggs.reset();
  eggs.setVisible(!!LEVELS[level].freeRide);
  leftBehind.visible = !!LEVELS[level].freeRide && finished();
  descent.reset();
  descent.setVisible(!!LEVELS[level].descent);
  document.body.classList.toggle('descent', !!LEVELS[level].descent);
  hud.run(null);
  // The Long Way Down: nothing to fight and nothing to find. Just the hill, and what is coming down it.
  if (LEVELS[level].descent) {
    config.horde.enabled = false;
    hotbox.wait = Infinity;
  }
  overLava = false;
  if (LEVELS[level].freeRide) {
    resetStats();
    powerups.reset();
    weapon.reset();
    weapon.give('sniper');
    weapon.owned = ['sniper'];
    config.horde.enabled = false;
    hotbox.wait = Infinity;
  }
  // The House, come to cold (from the menu, or after dying there): there are no waves to level up on, so you are
  // dealt a hand first: two more guns, a power-up, and eight upgrades of your choosing.
  if (LEVELS[level].finale) {
    hotbox.wait = Infinity;   // (no HotBox zones in here)
    drinkWait = 12;
    arena.houseSignal(null);
    arena.houseDrink(false);
    arena.houseExit(false);
    horde.bossVariant = 'd';   // (Babitus in all his gold: chains, rings and the crown)
    skater.vel.set(0, 0, -14);   // (in through the doors, rolling)
    chase.snap(skater);
  }
  if (LEVELS[level].finale && !carry && !creative) {
    const guns = Object.keys(WEAPONS).filter((id) => gunUnlocked(id) && !weapon.has(id)).sort(() => Math.random() - 0.5).slice(0, 2);
    for (const id of guns) weapon.give(id);
    const power = powerups.random();
    if (power) powerups.grant(power);
    pendingLevels = freeUpgrades = config.house.dealt;
  }
  hp = maxHp();
  model.setWeapon(weapon.def);
  hud.weapons(weapon, WEAPONS);
}
// Cosmetics: dress Kirky (in play and on the menu) and colour the bullets. Runs at
// startup and whenever something is bought or changed in the shop.
function applyLook() {
  const look = currentLook();
  model.applyLook(look);
  menuScene.kirky.applyLook(look);
  weapon.bulletMesh.material.color.set(look.tracer);
}
applyLook();
shop.onLook(applyLook);

const panel = createTweakPanel({ onRespawn: () => { if (!inMenu) restart(); } });

let demo = null;   // (the editor: the boss's move being shown, { act, wait })
let slowed = 0, lastBeam = null;   // (The Long Way Down: how much longer a hit holds you back; the last beam it has been shown)
function hurt(amount) {
  model.express?.('surprise', 0.7);
  if (LEVELS[level].freeRide) return;   // (nothing hurts in Free Ride)
  if (invulnerable > 0 || shield > 0 || dead || won || creative?.noDamage) return;
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
  if (hp <= 0 && secondChance) {   // not yet
    secondChance = false;
    hp = 30;
    shield = 3;
    horde.shockwave(skater.pos, 10, 60);
    hud.popup('Second Chance', 'loot');
    playPowerup();
  }
  if (hp <= 0) die();
}

// The run is over. (Killed by Babitus: first, the house wins.)
let losing = false, fallen = 0, deathCard = null;   // (fallen: how long he has been going down, dead; deathCard: the "You died" card, waiting for him to land)
function die() {
  if (LEVELS[level].descent && !losing && !preview) {   // (on the hill: knocked down, and then the hill arrives)
    losing = true;
    descent.state.wall = Math.max(descent.state.wall, 48 - skater.pos.z - 34);
    return cutscenes.buried(descent, () => { buried(); losing = false; });
  }
  if (LEVELS[level].finale && horde.boss && !losing && !preview) {
    losing = true;
    return cutscenes.houseWins(horde.boss, () => { die(); losing = false; });
  }
  dead = true;
  paused = true;
  document.exitPointerLock?.();
  const record = !creative && score.finish();   // Creative runs don't count toward your best
  const standing = creative ? 'Creative mode' : record ? 'new best!' : `best ${score.best.toLocaleString()}`;
  // (the card comes up once he has hit the ground: until then there is nothing between you and him going down)
  const lost = gold.carried >= 1 ? `${Math.floor(gold.carried).toLocaleString()} gold lost  ·  ` : '', lasted = hud.clock(horde.time);
  const card = `Score ${Math.floor(score.points).toLocaleString()}  ·  ${standing}
Survived ${lasted}  ·  wave ${horde.wave}  ·  level ${xp.level}  ·  ${horde.kills} kills  ·  top multiplier x${score.topMultiplier}  ·  best streak ${score.bestStreak}
${lost}Click to try again`;
  deathCard = { wait: 1.5, show: () => { hud.showOverlay('You died', card); offerPost(false); } };
}

// The Long Way Down: the collapse caught you. (Click, and the run starts again from the doors.)
function buried(fell = false) {
  dead = true;
  paused = true;
  document.exitPointerLock?.();
  playHurt();
  hud.showOverlay(fell ? 'Gone' : 'Buried', `${fell ? 'Off the side of the hill' : 'The hill caught you'} ${Math.round(fell ? 48 - skater.pos.z : descent.state.wall)} m down, after ${hillTime(descent.state.time)}
Click to run again`);
}

// What Kirky left on the Moon: once you have finished the game, the stub of the last cigarette is still lying where
// he smoked it, near where you arrive in Free Ride.
const leftBehind = new THREE.Group();
{
  const paper = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9 }), filter = new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.9 });
  const piece = (length, material, x, turn) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, length, 8).rotateZ(Math.PI / 2), material); m.position.set(x, 0.035, turn * 0.04); m.rotation.y = turn; leftBehind.add(m); };
  piece(0.13, filter, -0.1, 0);
  piece(0.1, paper, 0.02, 0);
  piece(0.12, paper, 0.14, 0.7);
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2a2a2c }));
  ash.position.set(0.2, 0.012, 0.1);
  leftBehind.add(ash);
  leftBehind.position.set(48.6, 0, 49.4);
  leftBehind.visible = false;
  scene.add(leftBehind);
}

// The ending. You have left the last ramp: the Moon, the last cigarette (cutscenes.lastCigarette), and what you get.
let titleCut = false;   // the title screen owes you its cut-in (you have just finished the game)
function finale(time, record) {
  if (!creative) leaderboard.postRun(time);
  setWorld(3);
  restart();
  last = performance.now();
  const outfit = slot('outfit'), found = outfit.options.filter((o) => o.secret && owns(outfit, o));
  cutscenes.lastCigarette({ look: currentLook(), costumes: found.map((o) => o.id), time: hillTime(time) }, () => {
    const prize = slot('smoke').options.find((o) => o.ending), first = !creative && !owns(slot('smoke'), prize);
    if (!creative) { clear(5); award(slot('smoke'), prize); applyLook(); titleCut = true; }
    if (first) cutscenes.reward(theEnd); else theEnd();
  });
  function theEnd() {
    const first = false;
    won = true;
    paused = true;
    document.exitPointerLock?.();
    playPortal();
    hud.showOverlay('The End', `Down the hill in ${hillTime(time)}  ·  ${record ? 'your fastest yet' : `your best is ${hillTime(descent.best)}`}
${first ? 'Yours to keep: the Golden BOOF (Shop, Style)\n' : ''}Click to return to the menu`);
  }
}

// The switch on the pause screen: story scenes on (they play) or off (they are skipped; the ending still plays).
{
  const button = document.getElementById('story-toggle'), show = () => { button.textContent = `Story scenes: ${load('story') === 'off' ? 'off' : 'on'}`; };
  button.addEventListener('click', (e) => { e.stopPropagation(); store('story', load('story') === 'off' ? 'on' : 'off'); show(); });
  show();
}

// The editor's jukebox: a button for each level's music and each story soundtrack, to listen to on its own.
{
  const list = document.getElementById('music-list');
  const NAMES = { dnb: 'The Cemetery (and the menu)', catacombs: 'The Catacombs', rock: 'A boss fight', house: 'The House', hill: 'The Long Way Down', moon: 'The Moon', casino: 'The casino' };
  const CUE_NAMES = { grave: 'Story: the cemetery', deep: 'Story: the Catacombs', city: 'Story: the city', house: 'Story: the House', collapse: 'Story: the collapse', air: 'Story: the launch', moon: 'Story: the Moon' };
  const button = (label, small, play) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${label}<small>${small}</small>`;
    b.addEventListener('click', () => {
      if (unlockAudio()) startMusic();
      for (const other of list.children) other.classList.remove('on');
      b.classList.add('on');
      play();
    });
    list.append(b);
  };
  for (const id of MUSIC_STYLES) button(NAMES[id], 'Level music', () => { stopCue(); holdMusic(null); setMusicStyle(id); });
  for (const id in CUE_NAMES) button(CUE_NAMES[id], 'Scene soundtrack (loops)', () => { holdMusic(0.02); stopCue(0.2); setTimeout(() => playCue(id), 60); });
  button('Menu music', 'What the menu normally plays', () => { stopCue(); holdMusic(null); setMusicStyle(finished() || moonMenu ? 'moon' : 'dnb'); });
  // Silence: every effect cut off, the soundtrack stopped, the level's music held at nothing (any music button brings it back).
  for (const id of ['sound-stop', 'sound-stop-2']) document.getElementById(id).addEventListener('click', () => {
    SOUNDS.stopAllSounds();
    stopCue(0.1);
    holdMusic(0);
    for (const other of list.children) other.classList.remove('on');
  });
}

// The editor's tabs (Scenes, Music, Sounds, Models), and its model library (ui/modelViewer.js): every monster, boss,
// costume and gun on a turntable, in place of the menu's scene while the Models tab is open.
const viewer = createModelViewer({ renderer, look: currentLook, horde });
{
  const tabs = [...document.querySelectorAll('#editor-tabs button')], pages = [...document.querySelectorAll('.editor-tab')];
  const list = document.getElementById('model-list'), info = document.getElementById('model-info');
  let last = 0;
  const pick = (i) => {
    last = i;
    viewer.show(i);
    info.textContent = viewer.info;
    [...list.querySelectorAll('button')].forEach((b, n) => b.classList.toggle('on', n === i));
  };
  const open = (name) => {
    for (const t of tabs) t.classList.toggle('on', t.dataset.tab === name);
    for (const p of pages) p.classList.toggle('hidden', p.dataset.tab !== name);
    const models = name === 'models';
    document.body.classList.toggle('model-view', models);
    if (models) pick(last); else viewer.hide();
  };
  for (const t of tabs) t.addEventListener('click', () => open(t.dataset.tab));
  document.getElementById('cinema-back').addEventListener('click', () => open('scenes'));
  let group = '';
  viewer.MODELS.forEach((m, i) => {
    if (m.group !== group) { group = m.group; list.append(Object.assign(document.createElement('h3'), { textContent: group })); }
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: m.name });
    b.addEventListener('click', () => pick(i));
    list.append(b);
  });
  const toggle = (id, key, label) => document.getElementById(id).addEventListener('click', (e) => { viewer[key] = !viewer[key]; e.target.textContent = `${label}: ${viewer[key] ? 'on' : 'off'}`; });
  toggle('model-spin', 'spin', 'Spin');
  toggle('model-animate', 'animate', 'Animate');
  document.getElementById('model-reset').addEventListener('click', () => viewer.resetView());
  // Drag anywhere that is not a button to turn it; scroll over the right-hand half of the screen to move in and out.
  const menuEl = document.getElementById('menu');
  let dragging = false;
  menuEl.addEventListener('mousedown', (e) => { if (viewer.active && !e.target.closest('button, input')) dragging = true; });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => { if (dragging && viewer.active) viewer.turn(e.movementX, e.movementY); });
  menuEl.addEventListener('wheel', (e) => { if (viewer.active && e.clientX > window.innerWidth * 0.5) { e.preventDefault(); viewer.zoomBy(e.deltaY > 0 ? 1.12 : 0.89); } }, { passive: false });
}

// The editor's sound library: every sound the game can make, sorted, each on a button.
{
  const list = document.getElementById('sound-list');
  const heading = (text) => list.append(Object.assign(document.createElement('h3'), { textContent: text }));
  const button = (label, play) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => { if (unlockAudio()) startMusic(); holdMusic(0.05); play(); });
    list.append(b);
  };
  const words = (name) => name.replace(/^play/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  // Where each belongs. Anything not named here turns up under "Other", so a new sound is never missing.
  const GROUPS = {
    'Player': ['playHurt', 'playHeal', 'playShieldHit', 'playTrickLand', 'playSwitch', 'playPickup', 'playLevelUp', 'playChest', 'playPowerup', 'playCoin', 'playCashIn', 'playVent'],
    'Combat': ['playHit', 'playKill', 'playHeadshot', 'playSplat', 'playClang', 'playSniper', 'playBossThrow', 'playBossPop', 'playBossBurst', 'playBossIntro', 'playBossDeath', 'playBones', 'playLaugh', 'playDread', 'playThunder'],
    'Portals and titles': ['playPortalOpen', 'playPortal', 'playExit', 'playTitleSting', 'playZone', 'playNext', 'playFanfare'],
    'Story: cemetery and Catacombs': ['playWind', 'playBell', 'playCrow', 'playInhale', 'playExhale', 'playChipFlip', 'playChipLand', 'playDrips', 'playCaveAir', 'playHatch', 'playLadder'],
    'Story: the city and the House': ['playManhole', 'playCity', 'playReveal', 'playPushOff', 'playDoorsBurst', 'playChandelier', 'playShuffle', 'playReelsStop', 'playCoinsPour', 'playFloorCrack'],
    'Story: the hill': ['playCreak', 'playGlass', 'playRumble', 'playDustWave', 'playGhosts', 'playGhostTell', 'playGhostThrow', 'playBuried', 'playWhoosh', 'playHush'],
    'Story: the Moon': ['playVoid', 'playMoonLand', 'playSnap', 'playLighter', 'playEndChord', 'playCredit', 'playSaucer', 'playRadio', 'playAlien', 'playGolden'],
    'Casino': ['playCard', 'playChip', 'playLose', 'playLever', 'playReel', 'playReelStop', 'playJackpot', 'playWheel', 'playShake', 'playPour', 'playClink', 'playCork', 'playGlassDown', 'playGulp', 'playHic', 'playWoozy', 'playGurgle', 'playRetch', 'playCough', 'playSplash', 'playDrag'],
  };
  heading('Guns');
  for (const w of Object.values(WEAPONS)) button(w.name, () => (w.id === 'sniper' ? SOUNDS.playSniper() : w.flame ? (SOUNDS.setFlame(true), setTimeout(() => SOUNDS.setFlame(false), 1500)) : SOUNDS.playShot(w.id, 1)));
  button('Machine gun, flat out', () => { for (let i = 0; i < 60; i++) setTimeout(() => SOUNDS.playShot('machineGun', 105), i * 16); });
  const placed = new Set(['playShot', ...Object.values(GROUPS).flat()]);
  GROUPS.Other = Object.keys(SOUNDS).filter((k) => /^play[A-Z]/.test(k) && !placed.has(k));
  for (const [group, names] of Object.entries(GROUPS)) {
    const have = names.filter((k) => typeof SOUNDS[k] === 'function');
    if (!have.length) continue;
    heading(group);
    for (const k of have) button(words(k), () => SOUNDS[k]());
  }
}

// ---- The spectator (the editor's Levels tab) --------------------------------------------------
// Any level, built as a run would find it but with nothing happening in it, and a camera that flies: the mouse looks,
// W A S D (the physical keys) fly, Space and C go up and down, Shift is fast, the wheel sets how fast. 'Lights' turns
// on a plain white light and takes the fog away, to see what the dark is hiding.
const SPECTATE = [1, 2, 4, 5, 3];   // (in the order the story visits them)
const SPECTATE_NAMES = { 1: 'The Cemetery', 2: 'The Catacombs', 3: 'The Moon', 4: 'The House', 5: 'The Long Way Down' };
const spec = (id) => document.getElementById(id);
let spectate = null;   // { level, yaw, pitch, speed, bright, fill, fog } while flying
const spectateLook = new THREE.Euler(0, 0, 0, 'YXZ'), spectateMove = new THREE.Vector3();
function startSpectate(n) {
  if (spectate) stopSpectate(false);
  viewer.hide();
  document.body.classList.remove('model-view');
  cutscenes.cancel();
  preview = null;
  creative = { weapons: [], upgrades: {}, powers: {}, monsters: false, noDamage: true };   // (nothing counts, nothing comes)
  setWorld(n);
  restart();
  if (LEVELS[n].descent) { onHill(60); arena.prime(skater.pos); }
  cutscenes.cancel();
  inMenu = false;
  paused = true;   // (the run itself never starts)
  menu.hide();
  menuScene.setVisible(false);
  model.setVisible(true);
  hud.hideOverlay();
  document.body.classList.add('spectating');
  spectate = { level: n, yaw: 0, pitch: -0.2, speed: 18, bright: false, fill: new THREE.AmbientLight(0xffffff, 2.4), fog: null };
  camera.position.set(skater.pos.x, skater.pos.y + 5, skater.pos.z + 12);
  spec('spectate-name').textContent = SPECTATE_NAMES[n];
  spec('spectate-light').textContent = 'Lights: as in the game';
  spec('spectate').classList.remove('hidden');
  last = performance.now();
}
function spectateLights(on) {
  if (!spectate || spectate.bright === on) return;
  spectate.bright = on;
  if (on) { scene.add(spectate.fill); spectate.fog = scene.fog; scene.fog = null; }
  else { scene.remove(spectate.fill); scene.fog = spectate.fog; }
  spec('spectate-light').textContent = `Lights: ${on ? 'everything lit' : 'as in the game'}`;
}
function stopSpectate(toList = true) {
  if (!spectate) return;
  spectateLights(false);
  spectate = null;
  creative = null;
  document.body.classList.remove('spectating');
  spec('spectate').classList.add('hidden');
  document.exitPointerLock?.();
  if (toList) { showMenu(); menu.showCinema(); }
}
// One frame of it. dx, dy: how far the mouse has moved.
function updateSpectate(dt, dx, dy) {
  const s = spectate;
  if (document.pointerLockElement) { s.yaw -= dx * 0.0022; s.pitch = Math.max(-1.5, Math.min(1.5, s.pitch - dy * 0.0022)); }
  camera.quaternion.setFromEuler(spectateLook.set(s.pitch, s.yaw, 0));
  spectateMove.set((input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0), 0, (input.down('KeyS') ? 1 : 0) - (input.down('KeyW') ? 1 : 0)).applyQuaternion(camera.quaternion);
  spectateMove.y += (input.down('Space') ? 1 : 0) - (input.down('KeyC') || input.down('ControlLeft') ? 1 : 0);
  camera.position.addScaledVector(spectateMove, s.speed * (input.down('ShiftLeft') ? 4 : 1) * dt);
  spec('spectate-where').textContent = `${camera.position.x.toFixed(0)}, ${camera.position.y.toFixed(0)}, ${camera.position.z.toFixed(0)}  \u00b7  ${s.speed.toFixed(0)} m/s`;
  if (s.bright && scene.fog) { s.fog = scene.fog; scene.fog = null; }   // (a level that puts its fog back)
}
{
  for (const n of SPECTATE) {
    const b = Object.assign(document.createElement('button'), { type: 'button' });
    // Two buttons a level: play it (a real run, straight in, whatever you have unlocked), or fly round it.
    const play = Object.assign(document.createElement('button'), { type: 'button' });
    play.innerHTML = `Play ${SPECTATE_NAMES[n]}<small>A run of this level on its own</small>`;
    play.addEventListener('click', () => { if (spectate) stopSpectate(false); viewer.hide(); document.body.classList.remove('model-view'); preview = null; startRun(null, n, { direct: true }); });
    b.innerHTML = `Fly round ${SPECTATE_NAMES[n]}<small>Spectator: nothing happening in it</small>`;
    b.addEventListener('click', () => startSpectate(n));
    spec('spectate-list').append(play, b);
  }
  // The bosses' moves, one at a time: the level starts (nothing can hurt you, and you have a gun), the boss arrives,
  // and he does that one thing, again every few seconds, for as long as you want to watch it.
  const head = Object.assign(document.createElement('h3'), { textContent: 'Boss moves' });
  spec('spectate-list').append(head);
  const boss = () => { if (!horde.boss) horde.spawnBoss(skater); return horde.boss; };
  const hand = (n) => { const b = boss(); if ((b.stage || 1) < n) { b.guard = 0; b.hp = b.maxHp * (n === 2 ? 0.6 : 0.3); } return b; };
  const MOVES = [
    [1, 'Hamzitus: a volley of filth', () => { boss().throwTimer = 0; }],
    [1, 'Hamzitus: his roar', () => { boss().roar = 1.6; }],
    [2, 'The Spider Queen: spits a web', () => { if (!horde.mini) horde.spawnMini(skater); if (horde.mini) horde.mini.throwTimer = 0; }],
    [2, 'Rubistus: a volley of bones', () => { boss().throwTimer = 0; }],
    [2, 'Rubistus: sheds skeletons', () => { horde.shed(boss()); }],
    [4, 'Babitus: red (a fan of cards)', () => { const b = boss(); b.call = { colour: 'red', wait: 0.9 }; b.wheel = 99; }],
    [4, 'Babitus: black (a rain of chips)', () => { const b = boss(); b.call = { colour: 'black', wait: 0.9 }; b.wheel = 99; }],
    [4, 'Babitus: zero (the house wins)', () => { const b = boss(); b.call = { colour: 'green', wait: 0.9 }; b.wheel = 99; }],
    [4, 'Babitus: the second hand (All In)', () => { hand(2); }],
    [4, 'Babitus: his run at you, and the slam', () => { const b = hand(2); b.wheel = 99; if (b.guard <= 0 && !b.rush && !b.slam) b.lunge = 0; }],
    [4, 'Babitus: the third hand (The House Always Wins)', () => { hand(3); }],
    [4, 'Babitus: the Last Hand', () => { const b = hand(3); if (b.stage === 3 && !b.last && b.guard <= 0) { b.hp = b.maxHp * 0.12; } }],
    [5, 'Goyitus Ultimus: a shot at you', () => { const B = descent.state.boss; B.harass = 0; B.wait = 99; }],
    [5, 'Goyitus Ultimus: the rite (shoot the sigils)', () => { const B = descent.state.boss; if (!B.rite) B.wait = 0; B.harass = 99; }],
    [5, 'Goyitus Ultimus: the rite fails (the barrage)', () => { const B = descent.state.boss; if (B.rite) B.rite.t = B.rite.time; else B.wait = 0; B.harass = 99; }],
  ];
  for (const [n, name, act] of MOVES) {
    const b = Object.assign(document.createElement('button'), { type: 'button' });
    b.innerHTML = `${name}<small>${SPECTATE_NAMES[n]}: watch it, over and over</small>`;
    b.addEventListener('click', () => {
      if (spectate) stopSpectate(false);
      viewer.hide(); document.body.classList.remove('model-view'); preview = null;
      startRun({ weapons: ['machineGun'], upgrades: {}, powers: {}, monsters: n !== 5, noDamage: true }, n, { direct: true });
      if (n === 5) onHill(260, 22);
      demo = { act, wait: 1.2, hill: n === 5 };
    });
    spec('spectate-list').append(b);
  }
  const step = (by) => startSpectate(SPECTATE[(SPECTATE.indexOf(spectate.level) + by + SPECTATE.length) % SPECTATE.length]);
  spec('spectate-light').addEventListener('click', (e) => { spectateLights(!spectate.bright); e.target.blur(); });
  spec('spectate-prev').addEventListener('click', () => step(-1));
  spec('spectate-next').addEventListener('click', () => step(1));
  spec('spectate-close').addEventListener('click', () => stopSpectate());
  window.addEventListener('wheel', (e) => { if (spectate) spectate.speed = Math.max(2, Math.min(200, spectate.speed * (e.deltaY > 0 ? 0.8 : 1.25))); }, { passive: true });
}

// ---- The cinematics editor (?editor in the address) ---------------------------------------------
// Every scene in the game, playable on its own from a list on the menu, with a bar across the top to pause it,
// drag it back and forth, slow it down and step through its lines. Each entry sets the game up the way the scene
// needs it (the level, a boss, a body) and then either plays it or does whatever makes the game play it.
//   run()      set up, and start it
//   replace()  for scenes that need Babitus in the room: runs in place of his arrival scene, once he is there
let moonMenu = false;   // (the editor: show the menu as it is after the ending, whether or not you have finished)
let preview = null;   // { item, started, idle, speed, wait, paused, replace } while one is being looked at
const at = (n) => { setWorld(n); restart(); };
const onHill = (s, speed = 0) => {   // stand Kirky `s` metres down the Long Way Down
  skater.pos.set(48, descentHeight(48, 48 - s) + (speed ? 1 : 0), 48 - s);
  skater.prevPos.copy(skater.pos);
  skater.vel.set(0, speed * 0.7, -speed);
  chase.snap(skater);
};
const ending = (all) => () => {
  at(3);
  const outfit = slot('outfit'), found = outfit.options.filter((o) => o.secret && (all || owns(outfit, o)));
  cutscenes.lastCigarette({ look: currentLook(), costumes: found.map((o) => o.id), time: '0:52.40' });
};
const CINEMATICS = [
  { name: 'Cemetery: the opening', where: 'Level 1', run: () => { at(1); cutscenes.intro(); } },
  { name: 'Hamzitus arrives', where: 'Level 1', run: () => { at(1); horde.spawnBoss(skater); } },
  { name: 'Hamzitus dies, the portal, the chip', where: 'Level 1', run: () => { at(1); horde.spawnBoss(skater); }, replace: () => horde.damage(horde.boss, 1e9, 0, 0) },
  { name: 'Through the portal', where: 'Level 1', run: () => { at(1); portal.open(skater.pos.x, skater.pos.y, skater.pos.z - 12); cutscenes.exit(); } },
  { name: 'Catacombs: the opening', where: 'Level 2', run: () => { at(2); cutscenes.under(); } },
  { name: 'The Spider Queen arrives', where: 'Level 2', run: () => { at(2); horde.spawnMini(skater); } },
  { name: 'Rubistus arrives', where: 'Level 2', run: () => { at(2); horde.spawnBoss(skater); } },
  { name: 'Rubistus dies, the manhole, the city, the doors', where: 'Level 2, then the hill', run: () => enterHouse(false) },
  { name: 'Babitus arrives', where: 'The House', run: () => at(4) },
  { name: 'All in', where: 'The House', run: () => at(4), replace: () => cutscenes.allIn(horde.boss) },
  // (he cannot be taken past his next hand in one go: so he is put in his last one first, and then killed)
  { name: 'Bust, and the takings', where: 'The House', run: () => at(4), replace: () => { const b = horde.boss; b.stage = 3; b.last = { t: 0, turn: 0 }; horde.damage(b, 1e9, 0, 0); } },
  { name: 'Out through the doors', where: 'The House', run: () => at(4), replace: () => { const d = houseSpot([HOUSE.doors.x, HOUSE.doors.z]); portal.open(d.x, 0, d.z, true); cutscenes.leaveHouse(); } },
  { name: 'The house wins', where: 'The House', run: () => at(4), replace: () => cutscenes.houseWins(horde.boss) },
  { name: 'Run: the casino comes down', where: 'The Long Way Down', run: () => { at(5); cutscenes.collapse(descent, () => descent.reset()); } },
  { name: 'Buried', where: 'The Long Way Down', run: () => { at(5); onHill(700); descent.state.wall = 690; cutscenes.buried(descent); } },
  { name: 'Launch', where: 'The Long Way Down', run: () => { at(5); onHill(DESCENT.ramp[1] - 0.5, 45); cutscenes.launch(descent); } },
  { name: 'The last boof', where: 'The Moon, with the costumes you own', run: ending(false) },
  { name: 'The last boof (everyone)', where: 'The Moon, with every costume', run: ending(true) },
  { name: 'The reward: the Golden BOOF', where: 'After the ending', run: () => { at(3); cutscenes.reward(); } },
  { name: 'Costume found', where: 'The Moon', run: () => { at(3); cutscenes.found({ name: 'A costume', wear() {} }); } },
  { name: 'The main menu, after the ending', where: 'The Moon (stays until you pick the one below)', run: () => { moonMenu = true; stopPreview(false); } },
  { name: 'The main menu, before the ending', where: 'The cemetery', run: () => { moonMenu = false; stopPreview(false); } },
  { name: 'The title screen, after the ending', where: 'The Moon menu', run: () => { moonMenu = true; stopPreview(false); menuScene.celebrate(); } },
];
const cine = (id) => document.getElementById(id);
function playCinematic(i) {
  viewer.hide();
  document.body.classList.remove('model-view');
  const item = CINEMATICS[(i + CINEMATICS.length) % CINEMATICS.length], keep = preview || { speed: 1, wait: true };
  cutscenes.cancel();
  preview = { item, started: false, idle: 0, speed: keep.speed, wait: keep.wait, paused: false, replace: item.replace || null };
  creative = { weapons: [], upgrades: {}, powers: {}, monsters: true, noDamage: true };   // (nothing here counts, and nothing can hurt)
  inMenu = false;
  menu.hide();
  menuScene.setVisible(false);
  model.setVisible(true);
  hud.hideOverlay();
  paused = false;
  last = performance.now();
  cine('cinema-name').textContent = `${item.name}  \u00b7  ${item.where}`;
  cine('cinema-pause').textContent = 'Pause';
  cine('cinema').classList.remove('hidden');
  if (unlockAudio()) startMusic();
  item.run();
}
function stopPreview(toList = true) {
  if (!preview) return;
  preview = null;
  creative = null;
  cine('cinema').classList.add('hidden');
  cutscenes.cancel();
  showMenu();
  if (toList) menu.showCinema();
}
// Every frame while a scene is being looked at: swap Babitus's arrival for the scene that was asked for, keep the
// bar up to date, and go back to the list when it is over.
function watchPreview(dt) {
  const info = cutscenes.info;
  if (preview.replace) {
    if (info) { const swap = preview.replace; preview.replace = null; cutscenes.cancel(); swap(); }
    return;
  }
  if (info) {
    preview.started = true;
    preview.idle = 0;
    if (info.waiting && !preview.wait) cutscenes.next();
    cine('cinema-time').textContent = `${info.time.toFixed(1)} / ${info.duration.toFixed(1)} s${info.waiting ? '  (waiting)' : ''}`;
    const bar = cine('cinema-seek');
    bar.max = info.duration;
    if (document.activeElement !== bar) bar.value = info.time;
  } else if (preview.started && (preview.idle += dt) > 0.7) stopPreview();
}
{
  const list = cine('cinema-list');
  CINEMATICS.forEach((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${item.name}<small>${item.where}</small>`;
    b.addEventListener('click', () => playCinematic(i));
    list.append(b);
  });
  const now = () => CINEMATICS.indexOf(preview.item);
  cine('cinema-seek').addEventListener('input', (e) => cutscenes.seek(Number(e.target.value)));
  cine('cinema-seek').addEventListener('change', (e) => e.target.blur());
  cine('cinema-pause').addEventListener('click', (e) => { preview.paused = !preview.paused; e.target.textContent = preview.paused ? 'Play' : 'Pause'; });
  cine('cinema-restart').addEventListener('click', () => playCinematic(now()));
  cine('cinema-speed').addEventListener('click', (e) => { preview.speed = { 1: 0.5, 0.5: 0.25, 0.25: 2, 2: 1 }[preview.speed]; e.target.textContent = `Speed ${preview.speed}x`; });
  cine('cinema-wait').addEventListener('click', (e) => { preview.wait = !preview.wait; e.target.textContent = `Wait on lines: ${preview.wait ? 'on' : 'off'}`; });
  cine('cinema-next').addEventListener('click', () => cutscenes.next());
  cine('cinema-prev').addEventListener('click', () => playCinematic(now() - 1));
  cine('cinema-after').addEventListener('click', () => playCinematic(now() + 1));
  cine('cinema-close').addEventListener('click', () => stopPreview());
}

// The end screen offers to put a real run's score on the shared leaderboard (not Creative runs).
function offerPost(escaped) {
  const points = Math.floor(score.points);
  if (!creative && points > 0) leaderboard.showEnd({ score: points, wave: horde.wave, time: Math.floor(horde.time), won: escaped });
}

// Through the exit portal: the level is done.
function levelComplete() {
  won = true;
  paused = true;
  document.exitPointerLock?.();
  playPortal();
  score.add(config.score.levelBonus);
  const record = !creative && score.finish();
  const standing = creative ? 'Creative mode' : record ? 'new best!' : `best ${score.best.toLocaleString()}`;
  const earned = creative ? 0 : Math.floor(gold.carried), before = profile.gold;   // out through the portal: the gold is yours
  bank(earned);
  if (!creative) goldTally.show(earned, before);   // (it counts up on the end screen)
  const next = creative ? 0 : LEVELS[level].next;   // (Creative runs are one level at a time)
  if (next && LEVELS[next].locked) reach(next);
  if (!creative) clear(level);   // (it can be started from the menu from now on)
  offer(next);
  hud.showOverlay(`${LEVELS[level].name} complete`, `Score ${Math.floor(score.points).toLocaleString()}  ·  ${standing}
Out in ${hud.clock(runTime)}  ·  XP level ${xp.level}  ·  ${horde.kills} kills  ·  top multiplier x${score.topMultiplier}  ·  best streak ${score.bestStreak}
${next ? `Next: ${LEVELS[next].name}. Everything you are carrying comes with you. Your gold is banked either way.` : 'Click to return to the menu'}`);
  if (!next) offerPost(true);   // (the score goes up when the run ends, not between levels)
}

// The end of a level that leads to another: two buttons, go deeper or end the run here. (next: the level it leads to, or 0.)
let deeper = 0;
function offer(next) {
  deeper = next || 0;
  document.getElementById('deeper').classList.toggle('hidden', !deeper);
  if (deeper) document.getElementById('go-deeper').textContent = `Go deeper: ${LEVELS[deeper].name}`;
}
document.getElementById('go-deeper').addEventListener('click', (e) => {
  e.stopPropagation();
  const next = deeper;
  offer(0);
  if (unlockAudio()) startMusic();
  goOn(next);
});
document.getElementById('end-run').addEventListener('click', (e) => {
  e.stopPropagation();
  offer(0);
  document.getElementById('overlay-hint').textContent += '\nClick to return to the menu';
  offerPost(true);   // (the run is over: the score can go on the board)
});

// Level up: stop the game and offer three upgrades.
function offerUpgrade() {
  choosing = true;
  paused = true;
  document.exitPointerLock?.();
  playLevelUp();
  const fromLevels = pendingLevels - freeUpgrades;   // level-ups are offered first, then any free picks
  const title = fromLevels > 0 ? `Level ${xp.level - fromLevels + 1}` : 'Old Tome';
  if (fromLevels <= 0) freeUpgrades--;
  const reroll = !creative && hasUnlock('reroll') ? () => rollUpgrades(3) : null;
  levelUp.show(title, rollUpgrades(3), (u) => stats.taken[u.id] || 0, describe, (upgrade) => {
    takeUpgrade(upgrade, run);
    pendingLevels--;
    if (pendingLevels > 0) return offerUpgrade();
    choosing = false;
    paused = false;
    shield = Math.max(shield, config.player.levelUpSafety);   // a few seconds to get your bearings
    last = performance.now();
    if (!panel.open) lockPointer();
  }, reroll);
}

// ---- Menu <-> run ------------------------------------------------------------
let paused = true;

// Pointer lock can be refused (e.g. embedded previews); the game still works without the mouse.
function lockPointer() {
  try { canvas.requestPointerLock()?.catch(() => {}); } catch {}
}

function showMenu() {
  inMenu = true;
  offer(0);
  document.body.classList.remove('free-ride', 'descent');
  hud.line(null);
  ride.leave();
  hud.ride(null);
  targets.setVisible(false);
  eggs.setVisible(false);
  // The menu has its own place: the cemetery, or, once you have finished the game, the Moon.
  { const home = finished() || moonMenu ? 3 : 1, moved = level !== home; if (moved) setWorld(home); if (moved || menuScene.moon !== (home === 3)) { menuScene.setPlace(home === 3); arena.prime(menuScene.origin); } }
  paused = true;
  document.exitPointerLock?.();
  hud.hideOverlay();
  if (drag) endDrag(false);
  cutscenes.cancel();
  goldTally.hide();
  setMusicStyle(finished() || moonMenu ? 'moon' : 'dnb');
  leaderboard.hideEnd();
  levelUp.hide();
  horde.reset();
  loot.reset();
  hotbox.reset();
  portal.reset();
  hud.boss(null);
  hud.hideBossIntro();
  hud.escape(null);
  hud.portalMarker(null);
  powerups.reset();
  xp.reset();
  horde.update(0, skater);          // (these three just redraw, now that everything is cleared)
  xp.update(0, skater);
  loot.update(0, skater, items);
  hud.chestMarker(null);
  hud.zoneMarker(null);
  hud.capture(null);
  hud.powers([]);
  hud.shield(0, false);
  hud.scope(false);
  model.setVisible(false);
  menuScene.setVisible(true);
  if (titleCut) { titleCut = false; menuScene.celebrate(); }   // (you have just finished the game: the title screen's own cut-in)
  gold.reset();
  gold.update(0, skater);
  hud.gold(null);
  shop.close();
  menu.show(score.best);
  document.getElementById('menu').classList.toggle('finished', finished());
  document.querySelector('#menu-home .tagline').textContent = finished() || moonMenu ? 'The house lost. Skate anyway.' : 'Skate the cemetery. Outlast the night.';
  leaderboard.showMenu();
}

// The casino: its own 3D room, entered from the menu. Leaving it comes back to the menu.
const casino = createCasino({ onLeave: showMenu });
// Emotes (hold T): in the casino and in Free Ride.
const emoter = createEmoter(model);
const emoteWheel = createEmoteWheel({
  canOpen: () => casino.active || (LEVELS[level].freeRide && !inMenu && !paused && !dead && !cutscenes.active),
  onPick: (i) => (casino.active ? casino.emote(i) : emoter.play(i)),
});
document.getElementById('menu-casino-open').addEventListener('click', () => {
  menu.hide();
  if (unlockAudio()) startMusic();
  casino.enter();
});

// From the menu's Start button. `loadout` is the Creative setup, or null.
// Start a run. loadout: Creative mode's choices (null: a normal run). chosen: the level. session: riding with friends
// ({ host } or { join }), or { direct: true } from the editor: straight into the level, without the story that leads to it.
function startRun(loadout, chosen = 1, session = null) {
  creative = loadout;
  demo = null;
  const direct = !!session?.direct, story = LEVELS[chosen].finale && !loadout && !direct;   // (the House opens with how you got there)
  if (!story) setWorld(chosen);
  ride.leave();
  if (session?.host) ride.host();   // (Free Ride with friends)
  else if (session?.join) ride.join(session.join);
  hud.name(getName() || 'Kirky');
  inMenu = false;
  menu.hide();
  menuScene.setVisible(false);
  model.setVisible(true);
  if (story) enterHouse(false);
  else restart();
  // The story so far, for where you are starting (not in Creative mode).
  if (direct) { if (LEVELS[chosen].descent) descent.reset(); }
  else if (!loadout && chosen === 1) cutscenes.intro();
  else if (!loadout && chosen === 2) cutscenes.under();
  else if (!loadout && LEVELS[chosen].descent) cutscenes.collapse(descent, () => descent.reset());
  paused = false;
  last = performance.now();
  if (unlockAudio()) startMusic();
  lockPointer();
}
menu.onStart(startRun);
// Any click on the menu is enough for the browser to let the music start.
document.getElementById('menu').addEventListener('click', () => { if (unlockAudio()) startMusic(); });

// ---- Pause -------------------------------------------------------------------
// On through the portal to the next level, as you are.
function goOn(next) {
  hud.hideOverlay();
  goldTally.hide();
  if (LEVELS[next].finale) { enterHouse(true); lockPointer(); return; }
  setWorld(next);
  restart(true);
  if (next === 2) cutscenes.under();
  else if (LEVELS[next].descent) cutscenes.collapse(descent, () => descent.reset());
  paused = false;
  last = performance.now();
  lockPointer();
}

// Into the House. It begins back in the Catacombs, with the story of how you get there (cutscenes.prologue, then
// cutscenes.street out on the hill); when he has gone through the casino's doors, the House is built and you roll in.
// carry: you have come from level 2 with what you were carrying (otherwise it is a fresh start: see restart).
function enterHouse(carry) {
  setWorld(2);
  restart(carry);
  paused = false;
  last = performance.now();
  cutscenes.prologue(() => {
    // Up the ladder: the city, a third of the way down the hill, with the casino at the top of it.
    setWorld(5);
    restart(carry);
    onHill(430);
    arena.prime(skater.pos);
    cutscenes.street(descent, (v) => arena.prime(v), () => {
      setWorld(4);
      restart(carry);
      last = performance.now();
    });
  });
}

function resume() {
  if (won) return deeper ? undefined : showMenu();   // (with the two buttons up, a click anywhere else does nothing)
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
canvas.addEventListener('click', () => { if (spectate || (!paused && !preview)) lockPointer(); });
canvas.addEventListener('mousedown', () => { if (!paused && cutscenes.active) cutscenes.next(); });   // (a click also moves the story on)
// Esc releases the pointer (browser behaviour); treat that as pause.
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && !paused && !panel.open) pause();
});
window.addEventListener('keydown', (e) => {
  if (inMenu) return;
  if (spectate) { if (e.code === 'Escape' && !document.pointerLockElement) stopSpectate(); else if (e.code === 'KeyL') spectateLights(!spectate.bright); return; }
  if (e.code === 'Backquote') {
    panel.toggle();
    if (panel.open) document.exitPointerLock?.();   // free the mouse for the sliders; the game keeps running
  } else if (e.code === 'Escape' && !document.pointerLockElement && !dead && !won && !choosing) {
    paused ? resume() : pause();
  } else if (/^Digit[1-9]$/.test(e.code) && !paused && !e.defaultPrevented) {
    if (weapon.equipSlot(Number(e.code.slice(5)) - 1)) weaponChanged();   // number keys pick a gun
  } else if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) {
    hud.popup(toggleMusic() ? 'Music on' : 'Music off', 'pending');
    syncAudioControls();
  } else if (e.code === 'Backspace' && !(e.target instanceof HTMLInputElement)) {
    restart();
  } else if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && cutscenes.active) {
    cutscenes.next();   // (a line of story stays up until you have read it)
  } else if (e.code === 'Tab' && cutscenes.active) {
    e.preventDefault();
    cutscenes.skip();   // (only the story scenes can be skipped)
  } else if (e.code === 'KeyR' && !e.repeat && !(e.target instanceof HTMLInputElement)) {
    backToSpawn();
  }
});

// Free Ride: put yourself back where you started (stuck, lost, or just a long way from your friends).
// The line you were on is lost; your best lines, the session and the targets are untouched.
function backToSpawn() {
  if (!LEVELS[level].freeRide || inMenu || dead || cutscenes.active) return;
  lines.fail('Back to spawn');
  skater.respawn();
  chase.snap(skater);
  overLava = false;
  hud.popup('Back to spawn', 'pending');
}
document.getElementById('respawn-button').addEventListener('click', backToSpawn);   // (on the pause screen; the click also resumes)

// Mouse wheel zooms the camera: up to come in closer, down to pull back.
window.addEventListener('wheel', (e) => {
  if (!paused && !inMenu) chase.zoomBy(Math.sign(e.deltaY));
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
const perfEl = document.getElementById('perf');
let perfOn = false, perfFrames = 0, perfTime = 0;
window.addEventListener('keydown', (e) => {
  if (e.code !== 'F3') return;
  e.preventDefault();
  perfOn = !perfOn;
  perfEl.classList.toggle('hidden', !perfOn);
});
let last = performance.now(), accumulator = 0, runTime = 0, ventWait = 0, overLava = false, burnWait = 0;
const freeRide = () => !!LEVELS[level].freeRide;

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

// What riding looks and sounds like (fx/rideFx.js, and setRide in fx/audio.js): none of it changes how he rides.
const rideFx = createRideFx(scene, camera), spot = new THREE.Vector3();
// Points, shown where they were made: `gained` since `before`, at a place in the world.
function floatPoints(before, at, lift, kind, label = '') {
  const gained = Math.round(score.points - before);
  if (gained <= 0) return;
  const [x, y] = onScreen(at, lift);
  hud.float(x, y, `${label}+${gained.toLocaleString()}`, kind);
}
// Streaks at the edge of the screen when he is going fast (config.feel.speedLines: where they begin, as a share of top speed).
function speedLines() {
  const from = config.feel.speedLines, fast = Math.max(0, (skater.speed / config.skate.maxSpeed - from) / (1 - from));
  hud.speedLines(Math.min(0.75, fast * fast * 0.6));
}

function handleEvents() {
  for (const e of skater.events) {
    if (e.type === 'land') {
      if (e.impact > 2) model.express?.('smile', 1.2, 0.7);
      chase.onLand(e.impact);
      if (freeRide()) {   // Free Ride: it all goes on your line
        const F = config.freeRide;
        if (e.trick) lines.add(e.trick, F.trickBase + e.boost * 3.6 * F.trickPerBoost);
        if (overLava) lines.add('Lava gap', F.lavaGap);
        if ((e.trick || lines.count) && e.airTime > F.airFrom) lines.add('Big air', (e.airTime - F.airFrom) * F.airPerSecond);
      }
      overLava = false;
      if (e.trick) {
        hud.popup(`${e.trick}  ${kmh(e.boost)}`, 'trick');
        playTrickLand(e.boost);
        trickLanded();
        const before = score.points;
        score.trick(e.boost);
        rideFx.land(skater, e.boost);
        floatPoints(before, skater.pos, 2.4, 'trick');
      } else rideFx.land(skater, 0);
    } else if (e.type === 'sloppy') {
      model.express?.('sad', 1.0, 0.7);
      lines.fail('Sloppy landing');
      overLava = false;
      chase.onSloppy();
      rideFx.land(skater, 0);
      hud.popup('Sloppy landing', 'sloppy');
    } else if (e.type === 'grind') {
      hud.popup(e.trick ? `${e.trick} to grind  ${kmh(e.boost)}` : 'Grind', 'trick');
      if (e.trick) { playTrickLand(e.boost); trickLanded(); score.trick(e.boost); }
      if (freeRide() && e.trick) lines.add(e.trick, config.freeRide.trickBase + e.boost * 3.6 * config.freeRide.trickPerBoost);
    } else if (e.type === 'grindStyle') {
      hud.popup(e.name, 'trick');
      playTrickLand(3);
      if (freeRide()) lines.add(e.name, config.freeRide.grindStyle);
    } else if (e.type === 'grindEnd') {
      score.grind(e.distance);
      if (freeRide() && e.distance > 2) lines.add(`Grind ${Math.round(e.distance)} m`, e.distance * config.freeRide.grindPerMetre);
    } else if (e.type === 'ceiling') {   // (the Catacombs) stuck to the roof
      hud.popup('Roof ride', 'trick');
      playTrickLand(4);
    } else if (e.type === 'ceilingEnd') {
      score.grind(e.distance * 2);   // worth double a grind
    } else if (e.type === 'fullpipe') {   // up one wall, across the roof and down the other
      hud.popup('Full pipe!', 'trick');
      playTrickLand(8);
      trickLanded();
      score.trick(8);
    } else if (e.type === 'trick') {
      model.express?.('ooh', 0.8);
      hud.popup(e.name, 'pending');
      playAir();
    } else if (e.type === 'ollie') {
      if (e.perfect) { hud.popup('Perfect pop', 'trick'); playTrickLand(2); score.add(60, 0.06); }
    } else if (e.type === 'revertTrick') {
      const before = score.points;
      score.add(config.score.revertPoints, 0.15);
      hud.popup('Revert', 'trick');
      playTrickLand(2);
      floatPoints(before, skater.pos, 2.4, 'trick');
      if (freeRide()) lines.add('Revert', 200);
    } else if (e.type === 'manualEnd') {
      if (e.distance > 4) {
        const before = score.points;
        score.add(e.distance * config.score.manualPoints, e.distance * 0.012);
        hud.popup(`Manual  ${Math.round(e.distance)} m`, 'trick');
        floatPoints(before, skater.pos, 2.4, 'trick');
        if (freeRide()) lines.add(`Manual ${Math.round(e.distance)} m`, e.distance * 12);
      }
    } else if (e.type === 'slideEnd') {
      if (e.distance > 4) {
        const before = score.points;
        score.add(e.distance * config.score.slidePoints, e.distance * 0.012);
        hud.popup(`Powerslide  ${Math.round(e.distance)} m`, 'trick');
        floatPoints(before, skater.pos, 2.4, 'trick');
        if (freeRide()) lines.add(`Powerslide ${Math.round(e.distance)} m`, e.distance * 14);
      }
    } else if (e.type === 'bail') {
      hud.popup('Lost your balance', 'sloppy');
      if (freeRide()) lines.fail('Lost your balance');
    }
  }
  skater.events.length = 0;

  for (const e of horde.events) {
    if (e.type === 'wave') { if (e.wave !== config.horde.bossWave) hud.popup(`Wave ${e.wave}`, 'alert'); }   // (the boss announces the last one himself)
    else if (e.type === 'swarm') hud.popup('Swarm!', 'alert');
    else if (e.type === 'elite') hud.popup('Something big is coming', 'alert');
    else if (e.type === 'wraiths') hud.popup('They can fly now', 'alert');
    else if (e.type === 'boss') cutscenes.boss();   // (his name, his roar and the music change are all in there)
    else if (e.type === 'bossThrow') playBossThrow();
    // The House: the wheel has been spun. The chandelier shows what is coming.
    else if (e.type === 'wheel') { arena.houseSignal(e.colour); hud.popup(e.colour === 'red' ? 'Red  \u00b7  cards' : e.colour === 'black' ? 'Black  \u00b7  chips' : 'Zero  \u00b7  the house wins', 'alert'); playSwitch(); }
    else if (e.type === 'wheelDone') arena.houseSignal(null);
    else if (e.type === 'payout') playChest();
    else if (e.type === 'bossHalf') { if (horde.boss && !horde.boss.T.house) cutscenes.allIn(horde.boss); }
    // Babitus's three hands.
    else if (e.type === 'bossStage') {
      SOUNDS.playBossIntro?.();
      if (e.stage === 2) { if (horde.boss) cutscenes.allIn(horde.boss); hud.place('All In', 'The second hand'); }
      else { SOUNDS.playThunder?.(); arena.houseSignal('red'); hud.place('The House Always Wins', 'The last hand'); }
      model.express?.(e.stage === 2 ? 'angry' : 'surprise', 2.5);
    }
    else if (e.type === 'houseRush') { hud.popup('He is coming for you', 'alert'); SOUNDS.playWhoosh?.(); }
    else if (e.type === 'houseTell') { hud.popup('\u25b2  Jump  \u25b2', 'alert'); SOUNDS.playDread?.(); }
    else if (e.type === 'houseSlam') { SOUNDS.playBossBurst?.(); if (e.hit) { hurt(e.hit); hud.popup('Slammed', 'sloppy'); } else hud.popup('Over it', 'trick'); }
    else if (e.type === 'lastHand') { SOUNDS.playThunder?.(); hud.place(e.again ? 'Double or Nothing' : 'LAST HAND', e.again ? 'He deals it again' : 'He bets everything he has left'); model.express?.('surprise', 2); }
    else if (e.type === 'spent') { hud.popup('He is spent  \u00b7  FINISH HIM', 'loot'); SOUNDS.playBossPop?.(); model.express?.('angry', 3); }
    else if (e.type === 'throw') playBones(0.2);   // a bone-thrower lets fly
    else if (e.type === 'clatter') playBones(0.15);   // ...and it lands
    else if (e.type === 'miniboss') cutscenes.queen();   // the Spider Queen arrives
    else if (e.type === 'miniDead') hud.popup(`${e.name} is dead`, 'loot');
    else if (e.type === 'webbed') hud.popup('Webbed!', 'alert');
    else if (e.type === 'bossShed') { playBones(0.7); chase.onSloppy(); }   // a pack of skeletons drops out of him
    else if (e.type === 'splat') playSplat();
    else if (e.type === 'bossDead') {
      const name = e.name;
      portal.open(e.x, e.y, e.z, !!e.house);   // (in the House the way out is its doors, not a portal)
      xp.pullAll();
      playBossDeath();
      if (e.house) { arena.houseSignal(null); arena.houseDrink(false); arena.houseExit(true); cutscenes.bust(() => hud.popup('The house is bust. Get to the doors', 'loot')); }
      else {
        const body = horde.corpse, said = () => hud.popup(`${name} is dead. The portal is open`, 'loot');
        const from = body && level === 1 && (!creative || preview) ? { x: body.x, y: body.y + body.T.height * body.scale * 0.5, z: body.z } : null;
        // (Level 1: the first chip. That is how Kirky learns where all this leads.)
        cutscenes.portal(from ? () => cutscenes.chipDrop(from, [`${name.split(' ')[0]} was carrying something.`, 'A gold chip, stamped B.G. Somebody is paying these things.'], said) : said);
      }
    }
    else if (e.type === 'kill') {
      playKill();
      if (e.headshot) playHeadshot();
      if (!e.quiet) hud.hitMarker('kill');
      xp.drop(e.x, e.y, e.z, e.xp);
      const pact = powerups.onKill();   // (Blood Pact: enough kills heal you)
      if (pact && hp < maxHp()) { run.heal(pact); playHeal(); }
      loot.maybeDrop(e);
      if (!creative) gold.maybeDrop(e, horde.finished);
      const before = score.points;
      const milestone = score.kill(e.score, { elite: e.elite, headshot: e.headshot, airborne: airborne() });
      if (!e.quiet) {
        rideFx.kill(e.x, e.y, e.z, e.headshot);
        playKillNote(score.streak);
        floatPoints(before, spot.set(e.x, e.y, e.z), 1.6, e.headshot ? 'head' : '', e.headshot ? 'Headshot  ' : '');
      }
      if (milestone) hud.popup(`${milestone}!`, 'alert');
    } else if (e.type === 'hit') {
      e.headshot ? playHeadshot() : playHit();
      hud.hitMarker(e.headshot ? 'crit' : 'hit');
    }
  }
  horde.events.length = 0;
}

// ---- HotBox cutscene ---------------------------------------------------------
// Clear a zone and time stops: the camera comes round to Kirky's face, he takes
// a long drag and blows out a cloud, then the camera pulls back, the power-up
// lands and everything carries on from where it was.
const DRAG = { moveIn: 0.5, inhaleEnd: 1.5, exhaleEnd: 2.6, end: 3.2, fov: 34 };   // seconds into the cutscene
const smooth = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const face = new THREE.Vector3(), close = new THREE.Vector3(), facing = new THREE.Vector3(), lookAt = new THREE.Matrix4(), closeQuat = new THREE.Quaternion();
const cutscenes = createCutscenes({ camera, model, skater, horde, portal, renderPos, skipStory: () => !preview && load('story') === 'off' });   // the boss, the portal and the exit
let drag = null;   // the cutscene in progress: { time, position, quaternion, fov } (where the camera was)

function startDrag() {
  drag = { time: 0, position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
  document.body.classList.add('cutscene');
  hud.capture(null);
  hud.zoneMarker(null);
  playDrag();
}

function updateDrag(dt) {
  const t = (drag.time += dt);
  // Kirky keeps breathing (nothing else moves): ember flaring on the way in, smoke on the way out.
  model.inhale = t < DRAG.inhaleEnd ? smooth((t - DRAG.moveIn * 0.6) / 0.4) : 0;
  if (t >= DRAG.inhaleEnd && t < DRAG.exhaleEnd) model.exhale(dt);
  model.update(dt, skater, renderPos, null, false);

  // The camera swings to just in front of his face, a little to one side, and back again.
  // (He stands side-on to the board, so find his face from his head and his cigarette.)
  model.root.updateMatrixWorld();
  if (model.faceAt) model.faceAt(face); else model.torso.localToWorld(face.set(0, 0.8, 0));
  model.ember.getWorldPosition(facing).sub(face).setY(0).normalize();
  const big = 1 + ((model.faceBig || 1) - 1) * 0.72;   // (his head is bigger than a man's: the camera stands off by that much)
  close.copy(facing).multiplyScalar(1.7 * big).addScaledVector(marker.set(facing.z, 0, -facing.x), 0.7 * big);   // (as an offset from his face)
  close.y += 0.08;
  // The ember lights his face (borrowing the gun's muzzle-flash light, which is idle).
  weapon.flash.position.copy(face).addScaledVector(facing, 0.45);
  weapon.flash.intensity = 0.35 + 1.1 * model.inhale;
  const k = smooth(t / DRAG.moveIn) * smooth((DRAG.end - t) / (DRAG.end - DRAG.exhaleEnd));
  // It travels round him in an arc (a straight line from behind would go through his head).
  const from = marker.copy(drag.position).sub(face);
  const a0 = Math.atan2(from.x, from.z), a1 = Math.atan2(close.x, close.z), angle = a0 + Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) * k;
  const radius = Math.hypot(from.x, from.z) + (Math.hypot(close.x, close.z) - Math.hypot(from.x, from.z)) * k;
  camera.position.set(face.x + Math.sin(angle) * radius, face.y + from.y + (close.y - from.y) * k, face.z + Math.cos(angle) * radius);
  closeQuat.setFromRotationMatrix(lookAt.lookAt(camera.position, face, camera.up));
  camera.quaternion.slerpQuaternions(drag.quaternion, closeQuat, k);
  camera.fov = drag.fov + (DRAG.fov - drag.fov) * k;
  camera.updateProjectionMatrix();

  if (t >= DRAG.end) endDrag(true);
}

// The first time you win a power-up in a run, the game stops on a card that says what it does.
const powerInfo = document.getElementById('power-info');
function explainPower(id) {
  const P = POWERUPS[id];
  powerInfo.style.setProperty('--power', `#${P.color.toString(16).padStart(6, '0')}`);
  document.getElementById('power-info-name').textContent = P.name;
  document.getElementById('power-info-text').textContent = P.explain;
  document.getElementById('power-info-more').textContent = `It works on its own, and it's yours for the rest of the run. Win it again in another HotBox Zone to strengthen it (up to level ${P.max}); level-up cards can improve it too.`;
  powerInfo.classList.remove('hidden');
  choosing = true;   // (the game waits, like it does for a level-up)
  paused = true;
  document.exitPointerLock?.();
}
function closePowerInfo() {
  if (powerInfo.classList.contains('hidden')) return;
  powerInfo.classList.add('hidden');
  choosing = false;
  paused = false;
  last = performance.now();
  if (!panel.open) lockPointer();
}
powerInfo.addEventListener('click', closePowerInfo);
window.addEventListener('keydown', (e) => {
  if (powerInfo.classList.contains('hidden') || !['Enter', 'Escape'].includes(e.code)) return;
  e.preventDefault();
  closePowerInfo();
});

// reward: false when the run is being reset under it.
function endDrag(reward) {
  drag = null;
  model.inhale = 0;
  weapon.flash.intensity = 0;
  document.body.classList.remove('cutscene');
  if (!reward) return;
  const won = powerups.random();   // you only find out what was in it now
  if (won) {
    const level = powerups.grant(won);
    if (level === 1) explainPower(won);   // new to you this run: stop and say what it does
    else hud.popup(`${powerups.label(won)}: ${POWERUPS[won].description}`, 'loot');
  } else {                         // every power-up is already at full strength
    run.heal(40);
    hud.popup('Everything maxed: +40 HP', 'loot');
  }
  playPowerup();
  score.add(250, 0.5);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));   // (never backwards: `last` is sometimes reset to a moment after this frame began)
  last = now;
  {
    const riding = !(inMenu || paused || spectate || casino.active || cutscenes.active || drag || dead);
    if (riding) speedLines(); else hud.speedLines(0);
    hud.balance(riding && skater.grinding ? skater.balance : null);
    rideFx.update(dt, skater, riding);
    setRide(riding ? Math.min(1, skater.speed / config.skate.maxSpeed) : 0, riding && skater.grounded, riding && skater.grinding, riding && skater.drifting);
  }
  let [mouseDX, mouseDY] = input.takeMouse();
  if (emoteWheel.open) mouseDX = mouseDY = 0;   // (the mouse is choosing an emote, not turning the camera)
  // F3: a readout of frames per second and how much was drawn last frame (for finding what makes it slow).
  if (perfOn) {
    perfFrames++;
    if ((perfTime += dt) >= 0.5) {
      const r = renderer.info.render;
      perfEl.textContent = `${Math.round(perfFrames / perfTime)} fps   ${(1000 * perfTime / perfFrames).toFixed(1)} ms\n${r.calls} draws   ${Math.round(r.triangles / 1000)}k triangles
slowest chunk ${arena.stats.build.toFixed(0)} ms`;
      perfFrames = perfTime = 0;
    }
  }
  if (paused || inMenu || dead) setFlame(false);

  if (casino.active) {   // in the casino (a room of its own, reached from the menu)
    casino.update(dt, input);
    renderer.render(casino.scene, casino.camera);
    return;
  }
  horde.eye.copy(camera.position);   // (monsters near the camera are drawn in detail)
  if (spectate) {   // (the editor's spectator has the screen: nothing runs but the world)
    updateSpectate(dt, mouseDX, mouseDY);
    arena.update(dt, camera.position);
    renderer.render(scene, camera);
    return;
  }
  if (inMenu && viewer.active) {   // (the editor's model library has the screen)
    viewer.update(dt);
    viewer.render();
    return;
  }
  if (inMenu) {
    menuScene.update(dt);
    arena.update(dt, menuScene.origin);
    renderer.render(scene, camera);
    return;
  }
  if (preview) watchPreview(dt);
  // Riding with friends carries on whatever you're doing (paused, in a cutscene): the others are still moving.
  ride.update(dt);
  hud.ride(ride.active || ride.status ? ride : null);

  // Paused, he is still on his board (nothing is posing him, but he has not got off it). Dead, he goes down.
  if (deathCard && (!dead || (deathCard.wait -= dt) <= 0)) { if (dead) deathCard.show(); deathCard = null; }
  if (paused && !inMenu && !cutscenes.active && !casino.active) {
    if (dead && !won) model.play?.('die', 1, 1, 0.5 + (fallen += dt) * 1.4, true);   // (from where his knees go, and a little quicker than it was acted)
    else if (model.riding) model.riding = performance.now();
  } else fallen = 0;
  if (!paused && drag) updateDrag(dt);
  else if (!paused && cutscenes.active) cutscenes.update(preview ? (preview.paused ? 0 : dt * preview.speed) : dt);
  else if (!paused) {
    accumulator += dt;
    while (accumulator >= STEP) {
      skater.update(STEP, input);
      accumulator -= STEP;
    }
    // (The Moon) The line you're building, the lava, and the vents.
    if (freeRide()) {
      const lava = lavaAt(skater.pos.x, skater.pos.z);
      burnWait -= dt;
      if (lava !== null && !skater.grounded && !skater.grinding) overLava = true;   // in the air over the pit: clear it and it's a gap
      if (lava !== null && skater.pos.y <= lava + 0.15 && burnWait <= 0) {
        // In the lava: no harm done (nothing harms you here), but the line is gone and you're thrown back out.
        burnWait = 1;
        overLava = false;
        lines.fail('Burnt');
        const dx = skater.pos.x - LAVA_LAKE.x, dz = skater.pos.z - LAVA_LAKE.z, d = Math.hypot(dx, dz) || 1;
        skater.vel.set((dx / d) * 9, config.freeRide.burnKick, (dz / d) * 9);
        skater.pos.y = lava + 0.3;
        skater.takeoff();
        hud.popup('Toasted!', 'sloppy');
        hud.flashHurt();
        playHurt();
      }
      targets.update(dt, skater.pos);
      eggs.update(dt);
      lines.update(dt, skater.grounded && !skater.grinding);
      for (const e of lines.events) {
        if (e.type === 'banked') {
          hud.popup(e.record ? `New best line!  ${e.total.toLocaleString()}` : `Line banked  ${e.total.toLocaleString()}`, e.record ? 'loot' : 'trick');
          if (e.record) { playPowerup(); leaderboard.postLine(e.total, e.count); } else playPickup();
          // A little gold for it, straight into the bank (there is nothing to lose it to out here).
          const pay = Math.min(config.freeRide.goldMax, Math.floor(e.total * config.freeRide.goldPerPoint));
          if (pay > 0) { bank(pay); hud.popup(`+${pay} gold`, 'loot'); }
        } else if (e.total > 0) hud.popup(`Line lost  ${e.total.toLocaleString()}`, 'sloppy');
      }
      lines.events.length = 0;
      hud.line(lines);
    }
    // (The Moon) Roll over a gas vent and it throws you into the air.
    ventWait -= dt;
    if (LEVELS[level].freeRide && ventWait <= 0 && skater.grounded && ventAt(skater.pos.x, skater.pos.z) >= 0) {
      ventWait = 0.8;
      eggs.vent(ventAt(skater.pos.x, skater.pos.z));
      skater.vel.y = Math.max(skater.vel.y, 0) + MOON.ventKick;
      skater.takeoff();
      hud.popup('Vent!', 'trick');
      playVent();
    }

    // (The Moon) The Geyser, in the Base, throws you to the top of the dome; a hoop is worth going through; and the
    // glass is a ceiling.
    if (LEVELS[level].freeRide) {
      if (ventWait <= 0 && skater.grounded && Math.hypot(skater.pos.x - GEYSER.x, skater.pos.z - GEYSER.z) < GEYSER.radius) {
        ventWait = 1.5;
        // Up to the Helter's top turn, on the bearing he was headed: how fast up puts the top of his flight just over
        // it (against gravity and the drag of the air), and how fast along has him out to it by then.
        const g = config.physics.gravity * (stats.gravity || 1), k = config.skate.airDrag, px = skater.pos.x - GEYSER.x, pz = skater.pos.z - GEYSER.z;
        let dx = skater.vel.x, dz = skater.vel.z;
        if (Math.hypot(dx, dz) < 1) { dx = skater.fwd.x; dz = skater.fwd.z; }
        const flat = Math.hypot(dx, dz) || 1, on = (px * dx + pz * dz) / flat;
        dx /= flat; dz /= flat;
        const reach = (r) => -on + Math.sqrt(Math.max(0, on * on - px * px - pz * pz + r * r));   // (how far along his line he meets a ring that far out from the Geyser)
        let aim = { r: 30 };
        for (let i = 0; i < 3; i++) { const far = reach(aim.r); aim = GEYSER.aim(Math.atan2(pz + dz * far, px + dx * far)); }
        const rise = aim.y + 0.3 - skater.pos.y, height = (v) => v / k - (g / (k * k)) * Math.log(1 + (k * v) / g);   // (how high a throw that fast gets)
        let low = 0, up = Math.sqrt(2 * g * rise) * 2;
        for (let i = 0; i < 40; i++) { const mid = (low + up) / 2; if (height(mid) < rise) low = mid; else up = mid; }
        const along = (reach(aim.r) * k) / (1 - Math.exp(-Math.log(1 + (k * up) / g)));
        skater.vel.set(dx * along, up, dz * along);
        skater.takeoff();
        hud.popup('Geyser!', 'loot');
        playVent();
      }
      for (const h of HOOPS) {
        // (which side of it he is on, and where he was when he changed sides: inside its ring?)
        const side = (skater.pos.x - h.x) * h.nx + (skater.pos.y + 0.9 - h.y) * h.ny + (skater.pos.z - h.z) * h.nz;
        if (h.side !== undefined && side * h.side < 0 && Math.abs(side) < 8 && Math.abs(h.side) < 8) {
          const x = skater.pos.x - h.x - h.nx * side, y = skater.pos.y + 0.9 - h.y - h.ny * side, z = skater.pos.z - h.z - h.nz * side;
          if (x * x + y * y + z * z < h.r * h.r) { lines.add('Hoop', h.pts || 600); if (!h.quiet) hud.popup('Through the hoop!', 'trick'); playPickup(); }
        }
        h.side = side;
      }
      const glass = domeAt(skater.pos.x, skater.pos.z) - 2.4;
      if (skater.pos.y > glass) { skater.pos.y = glass; if (skater.vel.y > 0) skater.vel.y = 0; }
    }

    // Draw between the last two physics states for smooth motion.
    renderPos.lerpVectors(skater.prevPos, skater.pos, accumulator / STEP);
    const { aimHeld: aiming, fireHeld: firing } = input;
    const scoped = aiming && !!weapon.def.scope;
    chase.update(dt, skater, renderPos, mouseDX, mouseDY, aiming, scoped, firing);
    hud.scope(scoped && chase.scope > 0.35);
    camera.updateMatrixWorld();

    // Monsters: spawn, chase, and claw at the player.
    invulnerable = Math.max(0, invulnerable - dt);
    const damage = horde.update(dt, skater);
    if (damage > 0) hurt(damage);

    // Gun: the arm points at whatever is under the crosshair, bullets fly there.
    weapon.aimPoint(camera, aimPoint);
    gunIsUp = aiming || firing;
    model.update(dt, skater, renderPos, aimPoint, aiming || firing, invulnerable, chase.scope > 0.4);
    emoter.update(dt);
    trickBuff = Math.max(0, trickBuff - dt);
    const damageMult = (airborne() ? stats.airDamage : 1) * (trickBuff > 0 ? 2 : 1);
    if (weapon.update(dt, firing, aiming, model.muzzle, aimPoint, horde, damageMult)) {
      model.onShot();
      chase.onShot(weapon.def.kick);
      if (weapon.def.beam) {
        playSniper();
        hud.scopeFlash();
        if (freeRide() && weapon.shot) {
          // Free Ride: what did that hit? A target, or another rider (whichever is nearer).
          const { origin, dir, reach } = weapon.shot;
          eggs.shot(dir);
          const rider = ride.rayHit(origin, dir, reach);
          const doing = { air: !skater.grounded && !skater.grinding, trick: !!skater.trick || Math.abs(skater.spin) > 1.2 || Math.abs(skater.flip) > 1.2, scoped: chase.scope > 0.5 };
          const target = targets.shoot(origin, dir, rider ? rider.dist : reach, doing);
          if (target) hud.hitMarker(target.head ? 'crit' : 'hit');
          else if (rider) {
            ride.hit(rider.id, rider.head);
            hud.hitMarker(rider.head ? 'crit' : 'hit');
            playHit();
            // A headshot on another rider gets the kill cam.
            if (rider.head) cutscenes.headshot({ origin, aim: dir, name: rider.name, victim: () => ({ pos: rider.ghost.pos, up: rider.ghost.skater.up }) });
            else hud.popup(`Tagged ${rider.name}`, 'trick');
          }
        }
      } else if (!weapon.def.flame) playShot(weapon.def.id, weapon.def.fireRate * stats.fireRate * (stats.frenzy > 0 ? 2 : 1));   // (the flamethrower roars for as long as it's held: see below)
    }
    setFlame(firing && !!weapon.def.flame);
    if (weapon.clangs) { weapon.clangs = 0; playClang(); }   // a sawblade bounced

    handleEvents();
    runTime = horde.time;
    if (demo && !cutscenes.active) {
      if (demo.hill) descent.state.wall = Math.min(descent.state.wall, 48 - skater.pos.z - 60);   // (the collapse keeps its distance while you watch)
      if ((demo.wait -= dt) <= 0) { demo.wait = 7; try { demo.act(); } catch (error) { console.warn(error); } }
    }
    const big = horde.boss || horde.mini;   // the boss, or the mini-boss: either gets the health bar
    hud.boss(big ? big.hp / big.maxHp : null, big?.title || big?.T.title);

    // The exit portal (open once the boss is dead): ride into it to finish the level.
    const exit = portal.update(dt, skater);
    if (portal.active) hud.portalMarker(...onScreen(portal.position, 3), Math.hypot(portal.position.x - skater.pos.x, portal.position.z - skater.pos.z));
    else hud.portalMarker(null);
    if (exit && !dead) { if (LEVELS[level].finale) cutscenes.leaveHouse(levelComplete); else cutscenes.exit(levelComplete); }
    if (!LEVELS[level].descent) hud.escape(horde.finished && !won ? horde.overtime : null);

    score.update(dt, skater.speed);
    hud.score(score);
    hud.streak(score, config.score.streakWindow);

    // Chests: ride over one to open it.
    stats.frenzy = Math.max(0, stats.frenzy - dt);
    shield = Math.max(0, shield - dt);
    // The Long Way Down: the collapse behind you, the ghosts either side, and the clock.
    if (LEVELS[level].descent && !dead && !won) {
      const d = descent.update(dt, weapon.bullets, weapon.def.beam && weapon.shot && weapon.shot !== lastBeam ? (lastBeam = weapon.shot) : null);
      hud.run(hillTime(descent.state.time), d.gap);
      // Goyitus Ultimus: what he is up to, and how you are doing against him.
      if (d.met) { hud.place('Goyitus Ultimus', 'Three brothers. One grudge.'); playGhostTell(0); }
      if (d.rite) { hud.popup(`▲  Shoot the ${d.rite} sigils  ▲`, 'alert'); playGhostTell(0); }
      if (d.sigil) { hud.hitMarker('crit'); model.express?.('smile', 0.6); }
      if (d.stun) { hud.popup(d.broken ? 'GOYITUS ULTIMUS IS BROKEN' : d.lost ? `${d.lost} is torn away` : 'Rite broken: he is stunned', 'loot'); playZone(); run.heal(d.broken ? 40 : 8); }
      if (d.barrage) { hud.popup('The rite is done: MOVE', 'alert'); playGhostTell(1); model.express?.('surprise', 1.2); }
      if (d.thrown) playGhostThrow();
      hud.boss(d.boss, d.charge > 0 ? 'Goyitus Ultimus: the rite' : 'Goyitus Ultimus');
      if (d.hit) { slowed = config.descent.slowTime; skater.vel.multiplyScalar(config.descent.slow); }   // (what hits you holds you back: and the collapse is right there)
      if (slowed > 0) { slowed -= dt; skater.vel.multiplyScalar(Math.exp(-0.9 * dt)); hud.lines?.(0); }
      if (d.zone) { hud.place(d.zone, 'The Long Way Down'); playZone(); }
      if (d.hit) { hurt(d.hit); hud.popup('Hit', 'sloppy'); }
      if (d.caught) { if (d.fell) buried(true); else cutscenes.buried(descent, () => buried()); }   // (it catches him: see it happen, then the end screen)
      else if (d.finished) cutscenes.launch(descent, () => finale(d.finished, d.record));   // (off the last ramp, toward the Moon)
    }
    // The House: every so often the barman puts a drink out. Ride past the bar to take it.
    if (LEVELS[level].finale && horde.boss) {
      const bar = houseSpot([HOUSE.bar.x + 2, HOUSE.bar.z]);
      if (drinkWait > 0 && (drinkWait -= dt) <= 0) { arena.houseDrink(true); hud.popup('A drink is on the bar', 'pending'); }
      if (drinkWait <= 0 && Math.hypot(skater.pos.x - bar.x, skater.pos.z - bar.z) < 5) {
        drinkWait = config.house.drinkEvery;
        arena.houseDrink(false);
        run.heal(config.house.drinkHeal);
        stats.frenzy = config.house.drinkFrenzy;
        hud.popup('On the house', 'loot');
        playHeal();
      }
    }
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
    if (box.captured) startDrag();   // the power-up arrives when he's finished his smoke
    powerups.update(dt, skater, renderPos, horde);
    hud.shield(powerups.shieldCharge(), stats.power.shield.level > 0);
    hud.powers(powerups.owned());

    // Gold: coins fly in like gems. Carried until you leave through the portal.
    if (gold.update(dt, skater) > 0) playPickup();
    hud.gold(creative ? null : gold.carried);

    // XP: gems fly in, and enough of them means an upgrade.
    const gain = xp.update(dt, skater);
    if (gain.collected) playPickup();
    pendingLevels += gain.levels;
    if (gain.spare > 0) score.add(gain.spare * config.xp.cappedGemPoints);   // at the level cap, XP becomes points
    if (pendingLevels > 0 && !choosing && !dead && !won) offerUpgrade();

    arena.update(dt, renderPos, aimPoint);
    hud.update(skater, aiming, hp, horde, xp, maxHp(), { 'Frenzy': stats.frenzy, 'Invincible': shield, 'Double damage': trickBuff });
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
window.game = { get drawn() { return { ...renderer.info.render, chunk: arena.stats.build }; }, get spectate() { return spectate; }, startSpectate, giveGold: (amount = 1000) => { bank(amount); shop.refresh(); return profile.gold; }, get cutscene() { return drag; }, casino, model, menuScene, viewer, gold, lines, ride, targets, descent, profile, shop, cutscenes, skater, config, chase, weapon, horde, xp, loot, score, hotbox, portal, powerups, stats, input, restart, showMenu, seed: SEED };
