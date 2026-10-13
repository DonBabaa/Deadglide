// The shared leaderboard: the list on the main menu, and the "post your score"
// box on the end-of-run screen. Scores are kept by a small function on the
// site that hosts the game (functions/api/leaderboard.js), so the board
// only works on the deployed site, not under `npm run dev`.
import { getName, setName } from './playerName.js';
import { multiplayer } from '../../mastre.json';

// Where that function is. On the game's own site it answers beside the game, at api/leaderboard. Served out of a
// folder of somebody else's site (the Mastre Gaming hub, which serves files and runs nothing) there is no function
// beside it: the game asks its own site instead, if mastre.json gives its address (multiplayer.server), and with
// none given there are no boards there.
const HOME = new URL('.', document.baseURI).pathname === '/';
const API = HOME ? 'api/leaderboard' : multiplayer.server ? `${multiplayer.server.replace(/\/+$/, '')}/api/leaderboard` : '';
const $ = (id) => document.getElementById(id);
const box = $('run-over'), nameInput = $('post-name'), sendButton = $('post-send'), status = $('post-status');
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

let run = null;   // the finished run waiting to be posted: { score, wave, time, won }

async function call(body, board = '') {
  if (!API) throw new Error('No leaderboard on this site');
  const res = await fetch(board ? `${API}?board=${board}` : API, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => null);   // (under `npm run dev` there is no function: this isn't JSON)
  if (!data) throw new Error('The leaderboard only works on the published site');
  if (!res.ok) throw new Error(data.error || 'The leaderboard is not answering');
  return data;
}

// Fill a list element with rows. `mine` is highlighted.
// how(row): the text in the third column.
const runHow = (r) => (r.won ? `Escaped ${clock(r.time)}` : `Wave ${r.wave}`), lineHow = (r) => `${r.wave} trick${r.wave === 1 ? '' : 's'}`;
// A time down the hill, from the score it is stored as (see functions/api/leaderboard.js).
const RUN_BASE = 1_000_000;
export const runTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
function draw(list, rows, count, mine = '', how = runHow, points = (r) => r.score.toLocaleString()) {
  list.replaceChildren(...rows.slice(0, count).map((r, i) => {
    const li = document.createElement('li');
    if (mine && r.name.toLowerCase() === mine.toLowerCase()) li.className = 'mine';
    const cell = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
    li.append(cell('rank', i + 1), cell('who', r.name), cell('how', how(r)), cell('pts', points(r)));
    return li;
  }));
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No scores yet. Be the first.';
    list.append(li);
  }
}

async function load(list, count, mine) {
  try { draw(list, (await call()).top, count, mine); }
  catch (err) { list.replaceChildren(Object.assign(document.createElement('li'), { className: 'empty', textContent: err.message })); }
}

async function post() {
  const name = nameInput.value.trim();
  if (!run || !name) { status.textContent = 'Enter a name first'; nameInput.focus(); return; }
  setName(name);
  sendButton.disabled = true;
  status.textContent = 'Posting...';
  try {
    const result = await call({ name, ...run });
    draw($('board'), result.top, 10, name);
    status.textContent = !result.improved ? `Not posted: ${name} already has ${result.best.toLocaleString()}`
      : result.rank ? `Posted. ${name} is #${result.rank}` : 'Posted, but not high enough to make the board';
    run = null;   // one post per run
  } catch (err) {
    status.textContent = err.message;
    sendButton.disabled = false;
  }
}

// Clicking the end screen restarts the run, so keep clicks and keys in here to ourselves.
box.addEventListener('click', (e) => e.stopPropagation());
box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') post(); });
sendButton.addEventListener('click', post);

export const leaderboard = {
  // The end-of-run screen: offer to post this run's score.
  showEnd(finished) {
    run = finished;
    nameInput.value = getName();
    sendButton.disabled = false;
    status.textContent = '';
    box.classList.remove('hidden');
    document.body.classList.add('run-over');
    load($('board'), 10, nameInput.value);
  },
  hideEnd() {
    run = null;
    box.classList.add('hidden');
    document.body.classList.remove('run-over');
  },
  // Free Ride's board: the best single lines. Shown when you pick Free Ride on the menu.
  async showLines() {
    const list = $('line-board');
    try { draw(list, (await call(null, 'line')).top, 8, getName(), lineHow); }
    catch (err) { list.replaceChildren(Object.assign(document.createElement('li'), { className: 'empty', textContent: err.message })); }
  },
  // The Long Way Down's board: the fastest times. Shown when you pick it on the menu.
  async showRuns() {
    const list = $('line-board');
    try { draw(list, (await call(null, 'run')).top, 8, getName(), () => '', (r) => runTime((RUN_BASE - r.score) / 100)); }
    catch (err) { list.replaceChildren(Object.assign(document.createElement('li'), { className: 'empty', textContent: err.message })); }
  },
  // Post a time down the hill, in seconds (it only counts if it beats the one this name already has).
  postRun(seconds) {
    const name = getName(), score = RUN_BASE - Math.round(seconds * 100);
    if (name && score > 0) call({ board: 'run', name, score, wave: 0, time: Math.round(seconds), won: true }).catch(() => {});
  },
  // Post a line (it only counts if it beats the one this name already has). Quietly: there is nobody to tell if it fails.
  postLine(total, count) {
    const name = getName();
    if (name && total > 0) call({ board: 'line', name, score: total, wave: count, time: 0, won: false }).catch(() => {});
  },
  // The list on the main menu.
  showMenu() { load($('menu-board'), 8, getName()); },
};
