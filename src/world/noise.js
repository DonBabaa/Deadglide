// Rolling hills: smooth, seeded 2D noise. The same (x, z, seed) always gives
// the same height, so the land is continuous across chunk borders.

// A repeatable pseudo-random number in 0..1 for a grid point.
function lattice(ix, iz, seed) {
  let h = (seed ^ Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smoothly blended lattice values, -1..1, with features about `size` metres across.
function layer(x, z, size, seed) {
  const fx = x / size, fz = z / size, ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10), sz = tz * tz * tz * (tz * (tz * 6 - 15) + 10);   // very smooth blend
  const a = lattice(ix, iz, seed), b = lattice(ix + 1, iz, seed), c = lattice(ix, iz + 1, seed), d = lattice(ix + 1, iz + 1, seed);
  return (a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sz) * 2 - 1;
}

// Tune the hills here: [metres across, metres high] for each layer.
const LAYERS = [[220, 10], [80, 2]];

export function hillHeight(x, z, seed) {
  let h = 0;
  for (let i = 0; i < LAYERS.length; i++) h += layer(x, z, LAYERS[i][0], seed + i * 101) * LAYERS[i][1];
  return h;
}
