// The shared leaderboard: the list on the main menu, and the "post your score"
// box on the end-of-run screen. Scores are kept by a small function on the
// site that hosts the game (netlify/functions/leaderboard.mjs), so the board
// only works on the deployed site, not under `npm run dev`.
import { getName, setName } from './playerName.js';

const API = '/api/leaderboard';
const $ = (id) => document.getElementById(id);
const box = $('run-over'), nameInput = $('post-name'), sendButton = $('post-send'), status = $('post-status');
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

let run = null;   // the finished run waiting to be posted: { score, wave, time, won }

async function call(body) {
  const res = await fetch(API, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => null);   // (under `npm run dev` there is no function: this isn't JSON)
  if (!data) throw new Error('The leaderboard only works on the published site');
  if (!res.ok) throw new Error(data.error || 'The leaderboard is not answering');
  return data;
}

// Fill a list element with rows. `mine` is highlighted.
function draw(list, rows, count, mine = '') {
  list.replaceChildren(...rows.slice(0, count).map((r, i) => {
    const li = document.createElement('li');
    if (mine && r.name.toLowerCase() === mine.toLowerCase()) li.className = 'mine';
    const cell = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
    li.append(cell('rank', i + 1), cell('who', r.name), cell('how', r.won ? `Escaped ${clock(r.time)}` : `Wave ${r.wave}`), cell('pts', r.score.toLocaleString()));
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
  // The list on the main menu.
  showMenu() { load($('menu-board'), 8, getName()); },
};
