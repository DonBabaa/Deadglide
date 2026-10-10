// All tuning constants live here. Press ` in game to tweak them live.
// Units: metres, seconds, radians/second for rates, degrees for angles.

export const config = {
  physics: {
    gravity: 28,
  },

  skate: {
    pushAccel: 14,        // W: steady acceleration, tapers to 0 at cruiseSpeed
    cruiseSpeed: 22,      // top speed from holding W alone
    kickImpulse: 7,       // Shift: speed added by one kick-push
    kickInterval: 0.45,   // seconds between kicks while Shift is held
    pushMaxSpeed: 34,     // kicks stop adding speed here; slopes and tricks can take you past it
    maxSpeed: 60,         // "100% speed" for camera/HUD (and later damage bonus)
    hardMaxSpeed: 90,     // absolute safety cap
    brakeDecel: 30,       // S
    rollFriction: 0.4,    // constant deceleration while rolling
    rollDrag: 0.03,       // speed-proportional deceleration while rolling
    airDrag: 0.02,

    turnRateSlow: 2.8,    // carve rate at standstill
    turnRateFast: 1.2,    // carve rate at maxSpeed
    grip: 12,             // how fast velocity follows the board's heading
    gripScrub: 0.3,       // speed lost while the board is slipping sideways
    sideSlip: 0.1,        // fraction of sideways gravity that gets through the wheels

    groundStick: 1.6,     // 1 = you leave the ground exactly when physics says so; higher = stickier over crests
    fallLineSpeed: 3,     // below this speed on a slope, the board swings to point downhill
    fallLineRate: 6,
    revertSpeed: 1,       // rolling backwards faster than this flips your stance

    airTurnRate: 3.2,     // A/D spin in the air (rotates the board, not your trajectory)
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
    hearts: 5,
    invulnerableTime: 1.2,   // seconds of safety after taking a hit
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
    spawnDistance: 48,    // how far away they claw out of the ground
    despawnDistance: 115, // left this far behind, they are recycled ahead of you
    riseTime: 0.7,        // seconds to climb out of the ground
    contactRange: 0.55,   // how close they must get to hurt you
    swarmEvery: 45,       // seconds between swarms (a ring closing in on you)
    swarmSize: 18,
    eliteEvery: 60,       // seconds between elites
    eliteHp: 12,          // elite health multiplier
  },

  gun: {
    damage: 10,
    aimAssist: 4,         // degrees: shots this close to a monster are pulled onto it (0 = off)
    fireRate: 10,         // shots per second while holding left mouse
    bulletSpeed: 170,
    bulletLife: 1.2,      // seconds before a bullet fizzles out
    spreadHip: 1.6,       // degrees of scatter firing from the hip
    spreadAim: 0.3,       // ...and while aiming
    recoil: 0.05,         // camera kick per shot
  },

  audio: {
    musicVolume: 0.55,
    sfxVolume: 0.8,
  },

  camera: {
    distance: 6,
    distanceFast: 9.5,    // pull back at maxSpeed
    pitch: 18,            // elevation above the board
    viewTilt: 12,         // how far above the rider the view is aimed (pitch - viewTilt = degrees looking down)
    lookHeight: 1.3,
    fov: 68,
    fovFast: 104,         // FOV kick at maxSpeed
    yawLag: 5,            // lower = lazier swing behind the board on turns
    followLag: 14,
    followLagY: 7,
    mouseSensitivity: 0.0022,
    aimYawLimit: 120,     // how far the mouse can swing the view from the board heading
    aimRecenter: 1.5,     // when not aiming, the view drifts back behind the board at this rate
    aimDistance: 3.4,     // right mouse: camera moves in over the shoulder...
    aimShoulder: 0.9,
    aimFov: 52,           // ...and zooms
    aimSensitivity: 0.7,  // mouse sensitivity multiplier while aiming
    landingDip: 0.03,
    sloppyShake: 0.35,
  },
};

// Snapshot so the tweak panel can reset.
export const defaults = JSON.parse(JSON.stringify(config));
