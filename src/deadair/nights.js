// Tonight's modifier: one real mechanic a run, so that no two nights in the station are the same night. Picked by the
// host as the run begins (index.js reset), shown on the choice card and in a banner as the first round starts, sent to
// the guests. Each is a few numbers the rest of the mode reads (index.js `N()`), not a mode of its own.
export const NIGHTS = [
  { id: 'blackout', name: 'BLACKOUT NIGHT', blurb: 'the strips are dead all night; your lamps are all there is', dark: true, lampGap: 0.6 },
  { id: 'lowgrav', name: 'LOW GRAVITY', blurb: 'the station lost its weight: jumps go high, the dead float when they are hit, and they come down slow', gravity: 0.55, knock: 1.8 },
  { id: 'quiet', name: 'THE QUIET', blurb: 'no runners, no screamers: only the slow ones, and every body on the floor is a sleeper', kinds: [['walker', 0.62], ['runner', 0.38]], sleepers: 'all', lampGap: 0.5, breath: 2 },
  { id: 'twins', name: "THE WARDEN'S TWINS", blurb: 'two of him at once, from the third round and every third', twins: true, wardenEvery: 3 },
  { id: 'steam', name: 'STEAM NIGHT', blurb: 'the air is thick with it: six metres of sight, no more, and the pipes let go', fog: 0.13, steam: 2 },
  { id: 'swarm', name: 'THE SWARM', blurb: 'twice as many, half as tough, and no let-up between them', count: 1.7, every: 0.55, hp: 0.6, more: 8 },
  { id: 'venting', name: 'THE BAY DOOR IS FAILING', blurb: 'every third round the outer door lets go: hold a rail (E), or shut it from the panel (F); whatever is loose goes out', decomp: 3 },
];
export const nightOf = (id) => NIGHTS.find((n) => n.id === id) || null;
export const pickNight = (rng = Math.random) => NIGHTS[Math.floor(rng() * NIGHTS.length)].id;
// One kind of the dead, by the night's own odds (the quiet), or null for the round's usual.
export function kindBy(night, rng = Math.random) {
  if (!night?.kinds) return null;
  let k = rng();
  for (const [kind, p] of night.kinds) { if (k < p) return kind; k -= p; }
  return night.kinds[night.kinds.length - 1][0];
}
