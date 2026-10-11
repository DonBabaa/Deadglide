// The slot machines: 5 gold a spin, three reels. Gold prizes for cherries,
// bars, bells and sevens, and three skulls wins a casino-only cosmetic (see
// systems/cosmetics.js): something you can't buy in the shop.
//
// The result of a spin is decided first, from the table below; the reels are
// then stopped on symbols that show it. Odds and payouts are all here.
import { casinoPrizes, award } from '../systems/cosmetics.js';

export const SPIN_COST = 5;
export const SYMBOLS = {
  cherry: '\u{1F352}', lemon: '\u{1F34B}', bell: '\u{1F514}', bar: 'BAR', seven: '7', skull: '\u{1F480}',
};
const NAMES = Object.keys(SYMBOLS);

// [chance, what the reels show, gold paid as a multiple of the stake, what to call it]
const OUTCOMES = [
  [0.004, ['seven', 'seven', 'seven'], 40, 'Jackpot!'],
  [0.015, ['bell', 'bell', 'bell'], 10, 'Three bells'],
  [0.025, ['bar', 'bar', 'bar'], 5, 'Three bars'],
  [0.05, ['cherry', 'cherry', 'cherry'], 3, 'Three cherries'],
  [0.12, ['cherry', 'cherry', null], 1, 'Two cherries: your stake back'],
  [0.04, ['skull', 'skull', 'skull'], 0, 'prize'],   // a cosmetic (or gold, once you have them all)
];
const PRIZE_FALLBACK = 10;   // three skulls with nothing left to win pays this many times the stake

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// A losing line: three symbols that don't pay (no three of a kind, no two cherries in front).
function losingLine() {
  for (;;) {
    const line = [pick(NAMES), pick(NAMES), pick(NAMES)];
    if (line[0] === line[1] && line[1] === line[2]) continue;
    if (line[0] === 'cherry' && line[1] === 'cherry') continue;
    return line;
  }
}

// Spin once. Returns { reels: [three symbol names], gold: gold won (0 if none), text, big: a big win,
// prize: the cosmetic won as { slot, option }, if any }. Winning a cosmetic gives it to you here.
export function spin() {
  let r = Math.random();
  for (const [chance, reels, pays, text] of OUTCOMES) {
    if ((r -= chance) >= 0) continue;
    const line = reels.map((s) => s || pick(NAMES.filter((n) => n !== 'cherry')));
    if (text !== 'prize') return { reels: line, gold: pays * SPIN_COST, text, big: pays >= 40 };
    const left = casinoPrizes();
    if (!left.length) return { reels: line, gold: PRIZE_FALLBACK * SPIN_COST, text: 'Three skulls', big: true };
    const [slot, option] = pick(left);
    award(slot, option);
    return { reels: line, gold: 0, text: `You won: ${option.name} (${slot.name.toLowerCase()})`, big: true, prize: { slot, option } };
  }
  return { reels: losingLine(), gold: 0, text: '', big: false };
}
