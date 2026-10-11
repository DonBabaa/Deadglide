// Roulette: the rules, with nothing about how it looks. A European wheel (one
// zero). You bet on SPOTS; a spot knows which numbers win it and what it pays.
//
// Each spot also has a place on the betting layout, in cells: the layout is 14
// cells wide and 5 deep (zero, twelve columns of numbers, the "2 to 1" boxes;
// under them the dozens, then the even-money bets). The 3D felt (room.js) and
// the on-screen board (casino.js) are both drawn from it.

// The numbers in the order they sit round the wheel.
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colour = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

export const LAYOUT = { width: 14, height: 5 };
// { id, label, kind: 'red' | 'black' | 'green' | 'out' (how to paint it), x, y, w, h, pays: N to 1, wins(number) }
export const SPOTS = [{ id: 'n0', label: '0', kind: 'green', x: 0, y: 0, w: 1, h: 3, pays: 35, wins: (n) => n === 0 }];
for (let n = 1; n <= 36; n++) {
  SPOTS.push({ id: `n${n}`, label: `${n}`, kind: colour(n), x: 1 + Math.floor((n - 1) / 3), y: 2 - ((n - 1) % 3), w: 1, h: 1, pays: 35, wins: (k) => k === n });
}
for (let row = 0; row < 3; row++) {
  SPOTS.push({ id: `col${row}`, label: '2:1', kind: 'out', x: 13, y: row, w: 1, h: 1, pays: 2, wins: (n) => n > 0 && (n - 1) % 3 === 2 - row });
}
for (let d = 0; d < 3; d++) {
  SPOTS.push({ id: `doz${d}`, label: `${d * 12 + 1} to ${d * 12 + 12}`, kind: 'out', x: 1 + d * 4, y: 3, w: 4, h: 1, pays: 2, wins: (n) => n > d * 12 && n <= d * 12 + 12 });
}
[
  ['low', '1 to 18', 'out', (n) => n >= 1 && n <= 18],
  ['even', 'Even', 'out', (n) => n > 0 && n % 2 === 0],
  ['red', 'Red', 'red', (n) => colour(n) === 'red'],
  ['black', 'Black', 'black', (n) => colour(n) === 'black'],
  ['odd', 'Odd', 'out', (n) => n % 2 === 1],
  ['high', '19 to 36', 'out', (n) => n >= 19],
].forEach(([id, label, kind, wins], i) => SPOTS.push({ id, label, kind, x: 1 + i * 2, y: 4, w: 2, h: 1, pays: 1, wins }));

export const spot = (id) => SPOTS.find((s) => s.id === id);

// Where the ball lands.
export const spinWheel = () => Math.floor(Math.random() * 37);

// What a set of bets ({ spot id: gold staked }) gets back when `number` comes up: winning stakes plus winnings.
export function settle(bets, number) {
  let back = 0;
  for (const [id, amount] of Object.entries(bets)) {
    const s = spot(id);
    if (s && s.wins(number)) back += amount * (s.pays + 1);
  }
  return back;
}
