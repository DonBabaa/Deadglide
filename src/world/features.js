// The building blocks of the world: ramps, pipes, tombs, rails, bowls...
// Each one is just a shape with a height function. worldgen.js scatters them
// around; chunkMesh.js draws them; the skater rides whatever heightAt returns.

export const rad = (d) => (d * Math.PI) / 180;

// Circular-arc "transition" (skate ramp profile): flat at d<=0, curves up to
// maxAngle, then stays at lip height.
export function transition(d, radius, maxAngle) {
  if (d <= 0) return 0;
  if (d >= radius * Math.sin(maxAngle)) return radius * (1 - Math.cos(maxAngle));
  return radius - Math.sqrt(radius * radius - d * d);
}
const transitionWidth = (radius, angle) => radius * Math.sin(angle);
const transitionHeight = (radius, angle) => radius * (1 - Math.cos(angle));

function linspace(a, b, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

// ---- Props: solid things sitting on the ground ---------------------------
// Each prop has local coordinates: u = "uphill"/forward direction, w = across.
// `facing` is the world direction of +u in degrees: 0 = +X, 90 = +Z, 180 = -X, 270 = -Z.
// us / ws are the grid lines used to build the mesh.

function prop(type, { x, z, facing = 0 }, us, ws, localHeight, extra = {}) {
  const yaw = -rad(facing);
  return {
    type, x, z, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw),
    us, ws, u0: us[0], u1: us[us.length - 1], w0: ws[0], w1: ws[ws.length - 1],
    y0: 0,          // rigid props: height of the ground at their centre (set by worldgen)
    drape: false,   // skate props: follow the ground underneath instead, so they sit cleanly on slopes
    localHeight, ...extra,
  };
}
const solidBox = (type, at, length, width, height, extra) =>
  prop(type, at, [-length / 2, length / 2], [-width / 2, width / 2], () => height, { height, ...extra });

// Launch ramp: curves up, then drops off.
export function kicker({ width = 5, radius = 9, angle = 35, ...at }) {
  const a = rad(angle), W = transitionWidth(radius, a);
  return prop('kicker', at, linspace(0, W, Math.ceil(W / 0.3)), [-width / 2, width / 2],
    (u) => transition(u, radius, a), { lipU: W, lipY: transitionHeight(radius, a), drape: true });
}

// Quarter pipe: transition, then a deck. `vert` adds a wall above the lip so
// you go straight up and come back down into the pipe.
export function quarter({ width = 14, radius = 5, angle = 72, deck = 4, vert = 0, ...at }) {
  const a = rad(angle), W = transitionWidth(radius, a), H = transitionHeight(radius, a);
  const us = [...linspace(0, W - 1e-4, Math.ceil(W / 0.25)), W + 1e-4, W + deck];
  return prop('quarter', at, us, [-width / 2, width / 2],
    (u) => (u < W ? transition(u, radius, a) : H + vert), { lipU: W, lipY: H, drape: true });
}

// Pyramid / funbox: ramps on all four sides, flat top.
export function funbox({ length = 16, width = 12, radius = 7, angle = 35, ...at }) {
  const a = rad(angle), L = length / 2, Wd = width / 2;
  const t = (d) => transition(d, radius, a);
  return prop('funbox', at, linspace(-L, L, Math.ceil(length / 0.4)), linspace(-Wd, Wd, Math.ceil(width / 0.4)),
    (u, w) => Math.min(t(u + L), t(L - u), t(w + Wd), t(Wd - w)), { topY: transitionHeight(radius, a), drape: true });
}

// Leaning fence round a grave plot: iron railings that have slumped over, so they work as a
// launch ramp. (It is drawn as see-through bars, but you ride it as a solid slope.) The long outer face rises to the lip (ride up it and you fly over the graves);
// the short inner face drops back down, steep but rideable, so you can also roll out of the plot.
export function fence({ width = 12, rise = 3, drop = 1.4, height = 1.6, ...at }) {
  return prop('fence', at, [0, rise, rise + drop], [-width / 2, width / 2],
    (u) => (u <= rise ? (height * u) / rise : height * (1 - (u - rise) / drop)), { lipU: rise, lipY: height, drape: true });
}

// Stone tomb / platform: a plain box you can ollie onto.
export const box = ({ length = 6, width = 4, height = 1.2, ...at }) => solidBox('box', at, length, width, height, { drape: true });

// Headstone. kind: 0 = rounded slab, 1 = cross, 2 = obelisk.
const HEADSTONE_SIZES = [[0.8, 0.22, 1.3], [0.9, 0.25, 1.7], [0.8, 0.8, 3.2]];   // length, width, height
export function headstone({ kind = 0, scale = 1, ...at }) {
  const [l, w, h] = HEADSTONE_SIZES[kind].map((v) => v * scale);
  return solidBox('headstone', at, l, w, h, { kind, scale });
}

// Mausoleum: a flat-roofed stone building you can land on.
export const mausoleum = ({ length = 7, width = 9, height = 4.6, ...at }) => solidBox('mausoleum', at, length, width, height);

// Monument: a pedestal with a statue on top. statue: 0 = angel, 1 = cross, 2 = urn.
export const monument = ({ statue = 0, ...at }) => solidBox('monument', at, 1.6, 1.6, 1.6, { statue });

// Tree trunk.
export const tree = ({ scale = 1.6, variant = 0, ...at }) => solidBox('tree', at, 0.6 * scale, 0.6 * scale, 12, { scale, variant });

// Street lamp post.
export const lamp = (at) => solidBox('lamp', at, 0.3, 0.3, 7);

// Chapel: a landmark you can see from far away. (The tower is taller than its solid box.)
export const chapel = (at) => solidBox('chapel', at, 13, 24, 9);

// ---- Shapes that are part of the ground itself -----------------------------

// Sunken bowl.
export function bowl({ x, z, flat = 7, radius = 6, angle = 70 }) {
  const a = rad(angle);
  return { x, z, flat, radius, angle: a, depth: transitionHeight(radius, a), outer: flat + transitionWidth(radius, a) };
}
export function bowlHeight(b, x, z) {
  const r = Math.hypot(x - b.x, z - b.z);
  return r < b.outer ? transition(r - b.flat, b.radius, b.angle) - b.depth : 0;
}

// Smooth mound: { x, z, r, h }.
export function moundHeight(m, x, z) {
  const r = Math.hypot(x - m.x, z - m.z);
  return r < m.r ? m.h * 0.5 * (1 + Math.cos((Math.PI * r) / m.r)) : 0;
}

// ---- Rails -----------------------------------------------------------------
// Straight grind rail between two points; ay / by are absolute heights.
export function rail(x1, ay, z1, x2, by, z2) {
  const len = Math.hypot(x2 - x1, by - ay, z2 - z1);
  return {
    ax: x1, ay, az: z1, bx: x2, by, bz: z2, len,
    dx: (x2 - x1) / len, dy: (by - ay) / len, dz: (z2 - z1) / len,
  };
}
