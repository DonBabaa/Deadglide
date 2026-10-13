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
    edgeKeep: 0.85,       // share of your speed kept when the edge of the world turns you along it (the Moon's unseen wall)
    parkSpeed: 1.2,       // slower than this (m/s) with no key held, he puts a foot down and stays put...
    parkSlope: 0.8,       // ...unless the ground is steeper than this (the upward part of its normal: 0.8 is about 37 degrees)
    rollFriction: 0.4,    // constant deceleration while rolling
    rollDrag: 0.03,       // speed-proportional deceleration while rolling
    airDrag: 0.02,

    // Carving has weight: the board leans into a turn rather than snapping to it, and bites harder the longer you hold it.
    carveIn: 9,           // how fast the lean builds when you press a way (per second: higher is snappier)...
    carveOut: 13,         // ...and how fast it comes back up when you let go
    carveBite: 0.3,       // how much harder a held carve turns (0.3 = up to 30% more)...
    carveBiteTime: 0.5,   // ...after this many seconds of holding it
    // Pumping: crouched (Space held) going down a slope, you push into it and come out faster.
    pumpAccel: 13,        // extra acceleration (m/s2) on a slope straight down; in proportion on a gentler one
    turnRateSlow: 2.8,    // carve rate at standstill
    turnRateFast: 1.2,    // carve rate at maxSpeed
    grip: 12,             // how fast velocity follows the board's heading
    gripScrub: 0.3,       // speed lost while the board is slipping sideways
    sideSlip: 0.1,        // fraction of sideways gravity that gets through the wheels

    // Shift (powerslide): the board is thrown sideways under you and you carry on the way you were going, scrubbing speed;
    // let go and it comes back round to point where you are headed.
    driftTurnMult: 1.6,   // (kept for the tweak panel: the slide itself uses the numbers below)
    slideTurn: 7,         // how fast the board comes round sideways (radians a second)
    slideMax: 1.35,       // how far round it goes (radians from the way you are travelling: 1.35 is about 77 degrees)
    slideRecover: 0.2,    // seconds it takes to swing back in line when you let go
    slideMinSpeed: 6,     // a slide slower than this does not count for points
    driftGrip: 0.7,       // how much the slide still bends where you are going (low: you carry straight on)...
    driftScrub: 0.5,      // ...and how hard it scrubs speed off
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
    // The full pipe (the Catacombs): ride up a wall, on past vertical, across the roof and down the other side.
    pipeGravity: 0.25,    // how much of gravity you feel on the pipe's walls (1 would make the loop all but impossible)
    ceilingReach: 0.2,    // jump to within this far of the roof (metres) and the board is pulled onto it
    ceilingSpeed: 6.4,     // you always set off across the roof at least this fast
    ceilingDrag: 7.7,       // metres per second lost every second you spend past vertical
    ceilingMinSpeed: 15.4,   // slower than this past vertical and you drop off
    wallBounce: 0.2,
  },

  jump: {
    chargeTime: 0.6,      // seconds of holding Space for a full ollie
    minSpeed: 6,          // tap
    maxSpeed: 11.5,       // full charge
    normalBlend: 0.5,     // 0 = always jump straight up, 1 = jump along the surface normal
    coyoteTime: 0.1,      // you can still ollie this long after leaving the ground
    // Timing the pop: let go just as the crouch bottoms out and it goes higher. (The charge bar turns white for that moment.)
    popFrom: 0.8,         // the window opens at this share of chargeTime...
    popTo: 1.3,           // ...and closes at this one (hold on longer and it is an ordinary full ollie)
    popBoost: 1.2,        // how much harder a well-timed one leaves the ground
  },

  // Landings never knock you down. A sloppy one just costs momentum.
  // Manuals (hold E on the ground): up on the back wheels, for as long as you hold it and keep moving.
  manual: {
    minSpeed: 3,          // slower than this and the front wheels come down
    drag: 0.6,            // extra deceleration while you are up (m/s2)
    revertWindow: 0.4,    // seconds after a landing in which tapping Shift is a revert
  },

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

  // The Long Way Down (level 5): the hill coming down behind you.
  descent: {
    wallStart: -70,       // where the collapse starts, in metres down the course (behind the doors)
    wallSpeed: 27,        // how fast it comes at first (m/s)...
    wallGain: 1.0,        // ...gaining this much every second...
    wallMax: 62,          // ...up to this
    wallLeash: 78,        // it is never further behind you than this
    wallKill: 3,          // closer than this and it has you
    throwEvery: 5.5,      // (the scene before the run still paces itself by this)
    throwTell: 0.9,
    throwFlight: 0.85,    // how long what he threw is in the air
    throwDamage: 22,      // if it lands on you while you are rolling on the ground (in the air or on a rail it misses)
    // Goyitus Ultimus (systems/descent.js).
    seals: 6,             // how many times his rite has to be broken to finish him
    harassEvery: 2.3,     // seconds between the single shots he keeps up...
    riteEvery: 6.5,       // ...and between his rites
    riteTime: 5.4,        // how long you have to shoot the sigils out (a quarter of a second less for every seal broken)
    sigilRadius: 2.6,     // how near a bullet has to pass to one (m)
    stunTime: 4,          // how long breaking a rite stuns him
    slow: 0.55,           // what a hit leaves of your speed...
    slowTime: 1.6,        // ...and for how long after it you are held back
    brokenRelief: 45,     // finishing him throws the collapse this far back (m)
  },

  // The House (the last fight, in the casino).
  house: {
    dealt: 8,             // upgrades you are dealt if you start there cold
    wheelEvery: 2.1,      // seconds between spins of the wheel (each spin is one of his attacks)...
    wheelFast: 1.4,       // ...once he is down to half health
    wheelTell: 0.9,       // how long the chandelier shows the colour before it happens
    cards: 11,             // red: a fan of this many cards, thrown flat at you (half as many again once he is hurt)
    cardSpeed: 42,
    cardDamage: 22,
    chips: 17,            // black: this many chips rain down round you
    chipDamage: 24,
    chipSplash: 8,
    addsEvery: 6,        // the slot machines pay out a pack of monsters this often...
    addsPack: 5,
    addsMax: 20,          // ...unless there are already this many about
    drinkEvery: 40,
    // The fight is three hands (see houseBoss in enemies/horde.js).
    stages: {
      second: 0.66,       // how much of his health is left when the second hand begins...
      third: 0.33,        // ...and the third
      guard: 2.6,         // seconds between hands when nothing can hurt him
      lungeEvery: 9,      // (from the second hand) seconds between his runs at you
      slamTell: 0.75,     // how long his arms are up before the slam
      slamRadius: 11,     // how far it reaches (m): be in the air when it lands
      slamDamage: 26,
      rainEvery: 0.7,     // (the third hand) seconds between chips off the ceiling
      lastHand: 0.12,     // how much of his health is left when he bets it all
      lastTime: 7,        // how long the storm of cards lasts
      spentTime: 5,       // how long he stands spent after it (taking double); not dead by then, he deals it again
    },       // seconds between drinks on the bar
    drinkHeal: 30,
    drinkFrenzy: 8,       // seconds of double fire rate with it
  },

  grind: {
    catchRadius: 0.8,     // how close (sideways) you must come down to a rail to lock on
    catchHeight: 0.5,
    pullRadius: 1.4,      // within this, coming down along a rail, you are drawn sideways onto its line...
    pull: 1.4,            // ...this quickly (per second)
    stepOff: 7,           // getting off a rail that has a safe side (the Moon's rim): how hard you are pushed that way (m/s)
    styleHold: 0.2,       // seconds a grind has to be held before it counts
    // Balance on a rail: you tip, slowly at first, and A / D lean you back. Past the edge and you are off it.
    balanceGrace: 0.6,    // seconds on the rail before it starts
    balanceTip: 1.5,      // how hard a lean feeds itself (higher: falls away faster)
    balanceWind: 0.45,    // how hard you are nudged off centre
    balancePush: 4.5,     // how hard A / D lean you
    balanceDamp: 1.2,     // how quickly a wobble settles
    minSpeed: 2,
    accel: 4,             // rails speed you up
    maxSpeed: 40,         // ...up to this
  },

  player: {
    maxHp: 100,
    invulnerableTime: 0.5,   // seconds of safety after taking a hit
    levelUpSafety: 1,        // seconds nothing can hurt you after choosing a level-up upgrade (kept short: you level up a lot)
  },

  // The monster spawn director (see enemies/horde.js).
  horde: {
    enabled: true,        // untick for a peaceful skate
    waveLength: 30,       // seconds per wave; each wave is bigger and tougher
    baseAlive: 14,        // monsters the director keeps around you in wave 1
    alivePerWave: 9,      // ...plus this many per wave after that
    maxAlive: 220,
    mobScale: 2,          // how big ordinary monsters and elites are drawn (and are to hit, and to be hit by); 1 = life size. Bosses have their own sizes in enemies/types.js
    baseSpawnRate: 3,     // monsters per second while topping up
    spawnRatePerWave: 1,
    hpGrowth: 0.15,       // extra monster health per wave (0.15 = +15%)
    damageGrowth: 0.05,   // extra monster damage per wave
    eliteDamage: 2.5,     // elites hit this many times harder
    spawnDistance: 48,    // how far away they claw out of the ground
    despawnDistance: 115, // left this far behind, they are recycled ahead of you
    riseTime: 0.7,        // seconds to climb out of the ground
    contactRange: 0.55,   // how close they must get to hurt you
    ramSpeed: 16.7,       // with Deck Spikes, ride into them faster than this (60 km/h) to hurt them instead (elites and the boss still hurt you); each extra level needs 6% less
    swarmEvery: 45,       // seconds between swarms (a ring closing in on you)
    swarmSize: 18,
    eliteEvery: 60,       // seconds between elites
    eliteHp: 12,          // elite health multiplier
    rattlerWave: 3,       // skeletons join in from this wave
    wraithWave: 5,        // ghosts join in from this wave
    wraithFlight: 4,      // ghosts that arrive together when a ghost wave starts (+2 each wave after the first)
    miniWave: 4,          // (level 2) the Spider Queen arrives when this wave starts
    miniHp: 3200,
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
    maxLevel: 20,         // the level cap; after it, gems are worth points instead
    cappedGemPoints: 15,  // ...this many per XP
    pickupRadius: 7,      // gems this close fly to you
    pullSpeed: 32,
    gemLifetime: 45,      // seconds before an uncollected gem fades
  },

  // The casino (from the main menu): walk in and bet your banked gold.
  // Free Ride (the Moon): how a line scores (see systems/lines.js).
  freeRide: {
    lineGap: 3.2,         // seconds rolling without adding to your line before it's banked
    trickBase: 100,       // every trick landed...
    trickPerBoost: 55,    // ...plus this for each km/h of boost it earned (harder tricks earn more)
    grindPerMetre: 14,
    airFrom: 1.2,         // seconds in the air before it counts as big air...
    airPerSecond: 150,    // ...and what each second after that is worth
    lavaGap: 1500,        // clearing the Lava Pit
    // Sniping a target is worth its points (see freeride/targets.js), multiplied by everything that applies:
    headshot: 2.5,
    perHundredMetres: 1,  // +100% for every 100 m of range
    grindStyle: 200,      // each different grind in a line (nosegrind, boardslide...)
    goldPerPoint: 0.0004, // a banked line pays a little gold: this much per point (10,000 points: 4 gold)...
    goldMax: 20,          // ...up to this much for one line
    airborne: 1.5,        // fired in the air
    trickShot: 2,         // fired mid-spin, mid-flip or mid-trick
    noScope: 1.5,         // fired without looking down the scope
    safeAfterHit: 3,      // seconds you can't be shot again after another rider knocks you off your board
    burnKick: 13,         // how hard the lava throws you back out (m/s, upward)
  },

  casino: {
    minBet: 10,
    maxBet: 500,
    walkSpeed: 4.2,       // metres per second on foot
    sprintSpeed: 8.4,     // ...and flat out, with Shift held
    turnRate: 2.4,        // radians per second with A / D
  },

  // Gold: dropped by monsters, banked only if you leave through the exit portal, spent in the shop.
  gold: {
    dropChance: 0.1,      // chance an ordinary monster drops a coin
    coinValue: 5,
    eliteGold: 25,
    bossGold: 150,
    overtimeBonus: 2,     // after the boss, ordinary monsters drop coins this many times as often
    lifetime: 90,         // seconds before an uncollected coin vanishes
    scale: 0.3,           // everything picked up is worth this much of its face value
    levelBonus: { 2: 1.75 },   // ...times this, by level (1 if not listed): the Catacombs pay better than the Cemetery
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
    heartChance: 0.03,    // chance a monster drops a small heart
    heartHeal: 10,        // HP a heart restores
    heartLifetime: 60,    // seconds before an uncollected heart fades
    heartPull: 5,         // hearts this close drift toward you
    weaponWeight: 1.5,    // how often each unowned gun turns up in a chest (ordinary items are 1 to 4)
    pickupRadius: 2.4,    // ride this close to open one
    chestLifetime: 100,    // seconds before an unopened chest disappears
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
    slidePoints: 6,       // points per metre of powerslide
    manualPoints: 5,      // points per metre of manual
    revertPoints: 150,    // points for a revert out of a landing
    streakWindow: 3.5,    // seconds you have to get the next kill before a kill streak ends
    streakBonus: 0.1,     // extra kill score per kill already in the streak (up to 20)
  },

  audio: {
    musicVolume: 0.55,
    sfxVolume: 0.8,
  },

  // How it feels.
  feel: {
    speedLines: 0.5,      // of top speed: where the streaks at the edge of the screen begin
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
