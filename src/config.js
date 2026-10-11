// All tuning constants live here. Press ` in game to tweak them live.
// Units: metres, seconds, radians/second for rates, degrees for angles.

export const config = {
  physics: {
    gravity: 28,
  },

  skate: {
    pushAccel: 14,        // W (roll): steady acceleration, tapers to 0 at cruiseSpeed
    cruiseSpeed: 22,      // top speed from rolling alone
    kickImpulse: 7,       // Q (push): speed added by one kick-push
    kickInterval: 0.35,   // shortest time between kicks (holding Q kicks at this rhythm)
    pushMaxSpeed: 34,     // pushes stop adding speed here; slopes and tricks can take you past it
    maxSpeed: 60,         // "100% speed" for camera/HUD (and later damage bonus)
    hardMaxSpeed: 90,     // absolute safety cap
    brakeDecel: 30,       // S: braking while rolling forwards
    reverseAccel: 12,     // S once stopped: acceleration backwards...
    reverseSpeed: 10,     // ...up to this speed
    rollFriction: 0.4,    // constant deceleration while rolling
    rollDrag: 0.03,       // speed-proportional deceleration while rolling
    airDrag: 0.02,

    turnRateSlow: 2.8,    // carve rate at standstill
    turnRateFast: 1.2,    // carve rate at maxSpeed
    grip: 12,             // how fast velocity follows the board's heading
    gripScrub: 0.3,       // speed lost while the board is slipping sideways
    sideSlip: 0.1,        // fraction of sideways gravity that gets through the wheels

    driftTurnMult: 1.6,   // Shift (powerslide): turn harder...
    driftGrip: 4.5,       // ...with less grip, so the board swings out...
    driftScrub: 0.35,     // ...shedding a little speed
    driftSideSlip: 0.5,

    groundStick: 1.6,     // 1 = you leave the ground exactly when physics says so; higher = stickier over crests
    fallLineSpeed: 3,     // below this speed on a slope, the board swings to point downhill
    fallLineRate: 6,
    revertSpeed: 1,       // rolling backwards faster than this flips your stance

    airTurnRate: 3.84,    // A/D spin in the air (rotates the board, not your trajectory)
    airFlipRate: 6.5,     // W/S front and back flips in the air (radians per second)
    alignRate: 14,        // how fast the board visually tilts to the ground
    airLevelRate: 6,      // how fast the board levels to the landing surface in the air
    airLevelLookahead: 0.2,

    stepHeight: 0.45,     // ledges taller than this are walls
    wallBounce: 0.2,
  },

  jump: {
    chargeTime: 0.6,      // seconds of holding Space for a full ollie
    minSpeed: 6,          // tap
    maxSpeed: 11.5,       // full charge
    normalBlend: 0.5,     // 0 = always jump straight up, 1 = jump along the surface normal
    coyoteTime: 0.1,      // you can still ollie this long after leaving the ground
  },

  // Landings never knock you down. A sloppy one just costs momentum.
  landing: {
    maxAngle: 45,         // board heading vs travel direction for a clean landing
    uprightAngle: 60,     // board tilt vs ground for a clean landing
    allowFakie: true,     // landing backwards counts as clean (and flips your stance)
    cleanBoost: 1.2,      // speed added on a clean landing
    sloppySpeedKeep: 0.4, // fraction of speed kept on a sloppy landing
    minAirTime: 0.15,     // hops shorter than this are never judged
    minCheckSpeed: 2,     // landings slower than this are never judged
  },

  // Board tricks: press E in the air. The list of tricks is in player/tricks.js.
  tricks: {
    speed: 1,             // >1 = every trick flips faster
    landTolerance: 0.6,   // land with a trick at least this far through and you still catch it
    spinTolerance: 30,    // an A/D body spin counts as a 180 from (180 - this) degrees
    boostPerSpin: 3,      // speed added on landing per 180 of body spin
    flipTolerance: 70,    // a W/S flip counts if you land within this many degrees of the full turn; otherwise it's a sloppy landing
    boostPerFlip: 7,      // speed added on landing per flip
    boostScale: 1,        // multiplies every trick's landing boost
    maxBoost: 20,         // most speed one landing can give
  },

  grind: {
    catchRadius: 0.8,     // how close (sideways) you must come down to a rail to lock on
    catchHeight: 0.5,
    minSpeed: 2,
    accel: 4,             // rails speed you up
    maxSpeed: 40,         // ...up to this
  },

  player: {
    maxHp: 100,
    invulnerableTime: 0.8,   // seconds of safety after taking a hit
    levelUpSafety: 4,        // seconds nothing can hurt you after choosing a level-up upgrade
  },

  // The monster spawn director (see enemies/horde.js).
  horde: {
    enabled: true,        // untick for a peaceful skate
    waveLength: 30,       // seconds per wave; each wave is bigger and tougher
    baseAlive: 14,        // monsters the director keeps around you in wave 1
    alivePerWave: 9,      // ...plus this many per wave after that
    maxAlive: 220,
    baseSpawnRate: 3,     // monsters per second while topping up
    spawnRatePerWave: 1,
    hpGrowth: 0.15,       // extra monster health per wave (0.15 = +15%)
    damageGrowth: 0.05,   // extra monster damage per wave
    eliteDamage: 2.5,     // elites hit this many times harder
    spawnDistance: 48,    // how far away they claw out of the ground
    despawnDistance: 115, // left this far behind, they are recycled ahead of you
    riseTime: 0.7,        // seconds to climb out of the ground
    contactRange: 0.55,   // how close they must get to hurt you
    ramSpeed: 16.7,       // with Deck Spikes, ride into them faster than this (60 km/h) to hurt them instead; each extra level needs 12% less
    swarmEvery: 45,       // seconds between swarms (a ring closing in on you)
    swarmSize: 18,
    eliteEvery: 60,       // seconds between elites
    eliteHp: 12,          // elite health multiplier
    rattlerWave: 3,       // skeletons join in from this wave
    wraithWave: 5,        // ghosts join in from this wave
    wraithFlight: 4,      // ghosts that arrive together when a ghost wave starts (+2 each wave after the first)
    bossWave: 7,          // the final boss arrives when this wave starts; it is the last wave
    bossHp: 8000,
    bossCrowd: 0.45,      // the ordinary crowd is thinned to this fraction during the boss fight
    bossRange: 95,        // he throws at you from up to this far away
    bossThrowEvery: 2.6,  // seconds between volleys (faster when he's nearly dead)
    bossBlobDamage: 22,   // a direct hit
    bossSplashDamage: 12, // caught in the splat
    bossSplashRadius: 3.2,
    // Overtime: once the boss is dead a portal opens and stays open. Leave through it to bank
    // your score, or stay and farm while the monsters come exponentially faster.
    bossClearRadius: 40,  // his death kills every monster this close to you
    escapeDistance: 170,  // how far away the portal opens
    overtimeSpawnRate: 4, // monsters per second when overtime starts...
    overtimeDoubling: 20, // ...doubling every this many seconds
    overtimeWave: 20,     // and they toughen up a wave every this many seconds
  },

  xp: {
    firstLevel: 5,        // XP needed for level 2...
    perLevel: 4,          // ...and this much more for each level after
    maxLevel: 30,         // the level cap; after it, gems are worth points instead
    cappedGemPoints: 15,  // ...this many per XP
    pickupRadius: 7,      // gems this close fly to you
    pullSpeed: 32,
    gemLifetime: 45,      // seconds before an uncollected gem fades
  },

  // Gold: dropped by monsters, banked only if you leave through the exit portal, spent in the shop.
  gold: {
    dropChance: 0.1,      // chance an ordinary monster drops a coin
    coinValue: 5,
    eliteGold: 25,
    bossGold: 150,
    overtimeBonus: 2,     // after the boss, ordinary monsters drop coins this many times as often
    lifetime: 40,         // seconds before an uncollected coin vanishes
  },

  // HotBox Zones: stand in one to earn a power-up (see systems/hotbox.js).
  hotbox: {
    maxPowers: 4,         // how many different power-ups you can hold; after that, zones only level up the ones you have
    radius: 7,            // metres across is twice this (fixed once the game has started)
    captureTime: 4,       // seconds you must stay inside
    drainTime: 3,         // seconds for the progress to drain away once you leave
    lifetime: 75,         // an unclaimed zone moves somewhere else after this long
    firstDelay: 8,        // seconds into a run before the first zone appears
    respawnDelay: 15,     // seconds after a capture before the next one
    minDistance: 60,      // how far away new zones appear
    maxDistance: 110,
  },

  loot: {
    chestChance: 0.03,    // chance a (non-elite) monster drops a chest; elites always do
    heartChance: 0.06,    // chance a monster drops a small heart
    heartHeal: 10,        // HP a heart restores
    heartLifetime: 30,    // seconds before an uncollected heart fades
    heartPull: 5,         // hearts this close drift toward you
    weaponWeight: 1.5,    // how often each unowned gun turns up in a chest (ordinary items are 1 to 4)
    pickupRadius: 2.4,    // ride this close to open one
    chestLifetime: 60,    // seconds before an unopened chest disappears
  },

  // Settings shared by every gun. Each gun's own numbers are in player/weapons.js.
  gun: {
    aimAssist: 4,         // degrees: shots this close to a monster are pulled onto it (0 = off)
    headshotMult: 2.5,    // damage multiplier for hitting a monster in the head
    recoil: 0.05,         // camera kick per shot
  },

  score: {
    levelBonus: 5000,     // points for leaving through the exit portal (before the multiplier)
    maxMultiplier: 8,
    killHeat: 0.12,       // how much one kill fills the style meter (1 = a whole multiplier)
    trickHeat: 0.3,       // ...and one landed trick
    cooling: 0.1,         // how fast the meter drains per second (much slower at speed)
    trickPoints: 40,      // points per m/s of trick boost
    grindPoints: 8,       // points per metre of grind
    speedThreshold: 15,   // going faster than this (m/s) earns points every second...
    speedPoints: 1.5,     // ...this many per m/s over it
    headshotBonus: 2,     // kill-score multipliers
    airKillBonus: 1.5,
    streakWindow: 3.5,    // seconds you have to get the next kill before a kill streak ends
    streakBonus: 0.1,     // extra kill score per kill already in the streak (up to 20)
  },

  audio: {
    musicVolume: 0.55,
    sfxVolume: 0.8,
  },

  camera: {
    distance: 6,
    distanceFast: 9.5,    // pull back at maxSpeed
    zoomMin: 0.5,         // mouse wheel: closest (a multiple of the distances above)...
    zoomMax: 2.6,         // ...and furthest
    zoomStep: 0.12,       // how much one wheel click changes it
    pitch: 18,            // elevation above the board
    viewTilt: 12,         // how far above the rider the view is aimed (pitch - viewTilt = degrees looking down)
    lookHeight: 1.3,
    fov: 68,
    fovFast: 104,         // FOV kick at maxSpeed
    yawLag: 5,            // lower = lazier swing behind the board on turns
    followLag: 14,
    followLagY: 7,
    mouseSensitivity: 0.0022,
    recenterDelay: 2,     // seconds without touching the mouse (or the gun) before the view drifts back behind the board...
    aimRecenter: 1.5,     // ...at this rate
    aimDistance: 3.4,     // right mouse: camera moves in over the shoulder...
    aimShoulder: 0.9,
    aimFov: 52,           // ...and zooms
    aimSensitivity: 0.7,  // mouse sensitivity multiplier while aiming
    scopeFov: 13,         // sniper scope: how far it zooms...
    scopeSensitivity: 0.22,   // ...and how much it slows the mouse
    landingDip: 0.03,
    sloppyShake: 0.35,
  },
};

// Snapshot so the tweak panel can reset.
export const defaults = JSON.parse(JSON.stringify(config));
