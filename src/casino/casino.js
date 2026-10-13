// The casino, from the main menu: walk round the room, sit at the blackjack
// table and bet your banked gold, alone or with friends. This file runs it:
// it moves gold in and out of your bank, drives the buttons on screen, and
// handles playing with friends. room.js draws everything; blackjack.js is the
// rules; net.js is the connection.
//
// Who runs the table:
//   alone   this browser does.
//   host    this browser does, and sends the table to everyone after every change.
//   guest   the host does. This browser sends what you do and shows what comes back.
// Either way everything on screen comes through deliver(): the table as it now
// stands, plus the things that just happened (a card, a result...). Each
// player's own browser moves their own gold when it sees their own result.
import { EMOTES } from '../player/emotes.js';
import { config } from '../config.js';
import { CasinoRoom } from './room.js';
import { DRINKS } from './bar.js';
import { spin, SPIN_COST, SYMBOLS } from './slots.js';
import { SPOTS, spinWheel, settle, colour } from './roulette.js';
import { Blackjack, handTotal, canSplit, currentHand } from './blackjack.js';
import { Net } from './net.js';
import { profile, pay, bank, houseTook } from '../systems/profile.js';
import { currentLook } from '../systems/cosmetics.js';
import { getName } from '../ui/playerName.js';
import { setMusicStyle } from '../fx/music.js';
import { playCard, playChip, playCashIn, playCoin, playLose, playPowerup, playLaugh, playReel, playReelStop, playLever, playJackpot, playWheel } from '../fx/audio.js';

const $ = (id) => document.getElementById(id);
const COIN = '<i class="coin"></i>';
const CHIPS = [10, 25, 100, 500];
const EMPTY = { state: { phase: 'betting', turn: -1, countdown: 0, turnLeft: 0, dealer: [], seats: [null, null, null, null, null] }, busy: false };

export function createCasino({ onLeave }) {
  const room = new CasinoRoom();
  const C = config.casino;

  let role = 'alone';     // 'alone' | 'host' | 'guest'
  let engine = null;      // the table, when this browser is running it
  let net = null;         // the connection, when playing with friends
  let code = '';          // the table's code
  let myId = 'me';
  let view = EMPTY;       // the table as last delivered: { state, busy }
  let outbox = [];        // things the table has done since it was last sent out
  let people = new Map(); // everyone in the room: id -> { id, name, look, x, z, yaw }
  let seat = -1;          // where you're sitting (-1 = walking about)
  let bet = 0;            // the bet you're building before the deal
  let lastBet = 0;
  let staked = 0;         // gold of yours on the table this round
  let sinceSync = 0, lastClock = '';

  const myName = () => getName() || 'Kirky';
  const myLook = () => { const { goldGuns, ...look } = currentLook(); return look; };   // (what the others need to draw you)
  const mySeat = () => (seat >= 0 ? view.state.seats[seat] : null);
  const seatOf = (id) => view.state.seats.findIndex((s) => s && s.id === id);

  // ---- Running the table (alone or as host) ---------------------------------------

  function newEngine() {
    engine = new Blackjack({ minBet: C.minBet, maxBet: C.maxBet, onEvent: (e) => outbox.push(e) });
    outbox = [];
    flush();
  }

  // Send the table out as it now stands, with what just happened, and show it here too.
  function flush() {
    const snap = { state: structuredClone(engine.state), busy: engine.steps.length > 0 }, events = outbox;
    outbox = [];
    if (role === 'host') net.broadcast({ t: 'table', ...snap, events });
    deliver(snap, events);
  }

  // A player (you, or as host a guest) wants to do something at the table.
  function request(id, what, arg, amount) {
    if (!engine) return net?.send({ t: what, arg, amount });   // a guest: ask the host
    const index = engine.state.seats.findIndex((s) => s && s.id === id);
    if (what === 'sit' && index < 0) engine.sit(arg, id === myId ? myName() : people.get(id)?.name || 'Player', id);
    else if (what === 'stand' && index >= 0) engine.leave(index);
    else if (what === 'act' && index >= 0) engine.act(index, arg, amount);
    flush();
  }

  // ---- What arrives --------------------------------------------------------------------

  function deliver(snap, events) {
    view = snap;
    const now = seatOf(myId);
    if (now !== seat) {   // sat down, or stood up
      seat = now;
      if (seat >= 0) { room.sit(seat); bet = 0; }
      else room.stand();
    }
    for (const e of events) happened(e);
    refresh();
  }

  // Something happened at the table. Gold changes hands here, and sounds play.
  function happened(e) {
    const me = mySeat();
    if (e.type === 'card') playCard();
    else if (e.type === 'dealerShowdown') room.showdown();   // 21 with three cards or more: he gets a cut-in
    else if (e.type === 'dealerBlackjack') {   // he thinks this is hilarious
      room.laugh();
      playLaugh();
      const el = $('casino-laugh');
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    } else if (e.type === 'roundStart' && me && me.ready && me.bet > 0) {
      pay(me.bet, () => {});   // your stake leaves your bank as the cards come out
      staked = lastBet = me.bet;
      playChip();
    } else if ((e.type === 'double' || e.type === 'split') && e.seat === seat) {   // (either way, more of your gold goes on the table)
      pay(e.extra, () => {});
      staked += e.extra;
      playChip();
    } else if (e.type === 'result' && e.seat === seat) {
      bank(e.payout);
      houseTook(staked - e.payout, staked);
      const net2 = e.payout - staked;
      banner({ blackjack: 'Blackjack!', win: 'You win', push: 'Push', lose: e.split ? 'You lose' : handTotal(me.cards).total > 21 ? 'Bust' : 'Dealer wins' }[e.result], net2);
      if (e.result === 'blackjack') { playPowerup(); playCashIn(); room.celebrate(true); }   // (up off his stool for it, with a cut-in)
      else if (e.result === 'win') { playCashIn(); room.celebrate(false); }
      else if (e.result === 'lose') playLose();
      else playCoin(0.3);
      staked = 0;
    } else if (e.type === 'roundEnd' && me) {
      bet = Math.min(lastBet, profile.gold, C.maxBet);   // the same bet again, if you can cover it
      if (bet < C.minBet) bet = 0;
      request(myId, 'act', 'bet', bet);
    }
  }

  // ---- Playing with friends ----------------------------------------------------------

  const handlers = {
    open(tableCode) {
      code = tableCode;
      if (role === 'host') { people = new Map([[myId, me()]]); newEngine(); shareWheel(); }
      else net.send({ t: 'hello', name: myName(), look: myLook() });
      netStatus('');
      refresh();
    },
    join() {},   // (a guest says hello once connected: see 'hello' below)
    leave(id) {
      people.delete(id);
      wheelBets.delete(id);
      shareWheel();
      request(id, 'stand');
    },
    message(id, m) {
      if (!m || typeof m !== 'object') return;
      if (role === 'host') {
        if (m.t === 'hello') {
          people.set(id, { id, name: String(m.name || 'Player').slice(0, 16), look: m.look || {}, x: 0, z: 12, yaw: Math.PI });
          net.sendTo(id, { t: 'welcome', id });
          net.sendTo(id, { t: 'table', state: structuredClone(engine.state), busy: engine.steps.length > 0, events: [] });
          shareWheel();
          refresh();
        } else if (m.t === 'here' && people.has(id)) {
          const whole = (n) => (Number.isInteger(n) ? n : -1);
          Object.assign(people.get(id), { x: Number(m.x) || 0, z: Number(m.z) || 0, yaw: Number(m.yaw) || 0, bar: whole(m.bar), glass: whole(m.glass), sip: Number(m.sip) || 0, slot: whole(m.slot), spin: !!m.spin, win: !!m.win, smoke: m.smoke === 1 || m.smoke === 2 ? m.smoke : 0, emote: Number.isInteger(m.emote) && m.emote > 0 && m.emote <= EMOTES.length ? m.emote : 0 });
        }
        else if (['sit', 'stand', 'act'].includes(m.t) && people.has(id)) request(id, m.t, m.arg, m.amount);
        else if (m.t === 'rbet' && people.has(id)) { wheelBets.set(id, cleanBets(m.bets)); shareWheel(); refresh(); }   // roulette: their chips...
        else if (m.t === 'rspin' && people.has(id)) hostSpin(id);                                                       // ...and they want it spun
      } else if (m.t === 'welcome') { myId = m.id; sendBets(); }
      else if (m.t === 'table') deliver({ state: m.state, busy: m.busy }, m.events || []);
      else if (m.t === 'people') { people = new Map(m.list.map((p) => [p.id, p])); refresh(); }
      else if (m.t === 'rbets') { tableBets = (Array.isArray(m.all) ? m.all : []).filter((p) => p && p.id !== myId).map((p) => ({ id: p.id, name: String(p.name || 'Player').slice(0, 16), bets: cleanBets(p.bets) })); refresh(); }
      else if (m.t === 'rspin') startSpin(Number(m.number));
    },
    closed(why) { goAlone(why); },
  };

  // What the others need to know to draw you: where you are, and what you're up to at the bar or a slot machine.
  const doing = () => ({
    x: room.pos.x, z: room.pos.z, y: +room.y.toFixed(2), yaw: room.yaw, bar: room.bar, lounge: room.lounge,
    glass: room.glass && room.glass.ready && room.glass.level > 0 ? DRINKS.findIndex((d) => d.id === room.glass.drinkId) : -1, sip: +room.sip.toFixed(2),
    slot: room.slot, spin: !!spinning, win: room.slot >= 0 && room.win > 0,
    smoke: room.smokeLeft > 0 ? room.puffing || 1 : 0,   // having a smoke at the table: 1 drawing on it, 2 blowing it out
    emote: room.emoter.playing,
  });
  const me = () => ({ id: myId, name: myName(), look: myLook(), ...doing() });

  function connect(asHost, joinCode) {
    if (staked > 0 || rolling || role !== 'alone') return;   // finish the hand (or the spin) first
    request(myId, 'stand');
    engine = null;
    role = asHost ? 'host' : 'guest';
    myId = asHost ? 'host' : 'me';
    people = new Map();
    view = EMPTY;
    net = new Net(handlers);
    netStatus(asHost ? 'Opening a table...' : 'Joining...');
    if (asHost) net.host();
    else net.join(joinCode);
    refresh();
  }

  // Back to a table of your own.
  function goAlone(why = '') {
    net?.close();
    net = null;
    if (staked > 0) { bank(staked); staked = 0; }   // the hand never finished: your stake comes back
    role = 'alone';
    myId = 'me';
    code = '';
    people = new Map();
    tableBets = [];
    wheelBets.clear();
    seat = -1;
    room.stand();
    newEngine();
    netStatus(why);
  }

  const netStatus = (text) => { $('casino-net-status').textContent = text; };

  // ---- The buttons --------------------------------------------------------------------

  function banner(text, amount) {
    const el = $('casino-banner');
    el.innerHTML = `${text}${amount ? ` <span class="${amount > 0 ? 'up' : 'down'}">${amount > 0 ? '+' : '−'}${COIN}${Math.abs(amount).toLocaleString()}</span>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;   // restart the animation
    el.classList.add('show');
  }

  function setBet(amount) {
    bet = Math.max(0, Math.min(C.maxBet, profile.gold, amount));
    request(myId, 'act', 'bet', bet);
    playChip();
  }

  function deal() {
    if (bet < C.minBet || bet > profile.gold || view.state.phase !== 'betting') return;
    request(myId, 'act', 'ready');
  }

  function play(action) {
    const mine = mySeat();
    if (!mine) return;
    if (action === 'double' && profile.gold < currentHand(mine).bet) return;   // (can't cover it)
    if (action === 'split' && (profile.gold < mine.bet || !canSplit(mine))) return;
    request(myId, 'act', action);
  }

  function standUp() {
    if (room.roulette) { if (!rolling) { room.stand(); sendBets(); } return; }     // away from the roulette table (your chips come with you)
    if (room.slot >= 0) { if (!spinning) { room.stand(); refresh(); } return; }   // away from a slot machine
    if (room.bar >= 0) { room.stand(); refresh(); return; }   // off a bar stool
    if (room.lounge >= 0) { room.stand(); refresh(); return; }   // up off a sofa
    if (seat < 0 || staked > 0) return;   // not with a bet on the table
    request(myId, 'stand');
  }

  // At the bar: pay, and the barman gets to work.
  function order(drink) {
    if (profile.gold < drink.price || !room.order(drink)) return;
    pay(drink.price, () => {});
    playChip();
    refresh();
  }

  // ---- The slot machines -----------------------------------------------------------------
  let spinning = null;   // the spin in progress: { result, time, stopped }
  const reelEls = [...document.querySelectorAll('#casino-reels span')], names = Object.keys(SYMBOLS);
  const shown = [];   // (the same three symbols go on the machine's own screen)
  const showReel = (el, name) => { el.textContent = SYMBOLS[name]; el.className = name; shown[reelEls.indexOf(el)] = SYMBOLS[name]; if (shown.length === 3) room.showReels(shown); };
  reelEls.forEach((el, i) => showReel(el, ['seven', 'skull', 'seven'][i]));

  function pullLever() {
    if (room.slot < 0 || spinning || room.win > 0 || profile.gold < SPIN_COST) return;
    pay(SPIN_COST, () => {});
    spinning = { result: spin(), time: 0, stopped: 0, tick: 0 };   // (decided now; the reels catch up)
    room.pull();
    playLever();
    $('casino-slot-result').textContent = '';
    refresh();
  }

  // The reels blur, then stop one at a time, left to right, the last one late.
  function runSlots(dt) {
    if (!spinning) return;
    const s = spinning, STOPS = [0.9, 1.5, 2.35];
    s.time += dt;
    if ((s.tick += dt) > 0.07) { s.tick = 0; playReel(); }
    reelEls.forEach((el, i) => {
      if (i < s.stopped) return;
      if (s.time >= STOPS[i]) { showReel(el, s.result.reels[i]); el.classList.add('stopped'); s.stopped = i + 1; playReelStop(); }
      else showReel(el, names[Math.floor(Math.random() * names.length)]);
    });
    if (s.stopped < 3) return;
    // All three are down: pay out.
    const { result } = s;
    spinning = null;
    bank(result.gold);
    houseTook(SPIN_COST - result.gold, SPIN_COST);
    $('casino-slot-result').textContent = result.gold ? `${result.text}  +${result.gold}` : result.text || 'Nothing. Again?';
    if (result.prize) room.kirky.applyLook(currentLook());   // he puts it straight on
    if (result.big) { room.bigWin(result.prize ? result.prize.option.name : `+${result.gold} gold`); playJackpot(); }
    else if (result.gold > SPIN_COST) playCashIn();
    else if (result.gold) playCoin(0.4);
    else playLose();
    refresh();
  }

  function refreshSlots() {
    const playing = room.slot >= 0;
    $('casino-slots').classList.toggle('hidden', !playing);
    if (!playing) return;
    $('casino-spin').disabled = !!spinning || room.win > 0 || profile.gold < SPIN_COST;
    if (profile.gold < SPIN_COST && !spinning) $('casino-slot-result').textContent = `You need ${SPIN_COST} gold to spin`;
  }
  $('casino-spin').innerHTML = `Spin ${COIN}${SPIN_COST} <kbd>Space</kbd>`;
  $('casino-spin').addEventListener('click', pullLever);

  // ---- Roulette ---------------------------------------------------------------------------
  // One wheel for the whole room. Click the board to bet; anyone at the table with a bet down can
  // spin, and that spin is everybody's: the host picks the number and tells the others. Each player
  // settles their own gold when the number is called. (Alone, you are the host.)
  //   guest -> host:  { t: 'rbet', bets }   { t: 'rspin' }
  //   host -> guests: { t: 'rbets', all: [{ id, name, bets }] }   { t: 'rspin', number }
  const WHEEL_CHIPS = [5, 25, 100];
  let bets = {}, chip = WHEEL_CHIPS[0];   // your bets: { spot id: gold }
  let rolling = null;                     // the spin in progress: { number, total, back, paid, playing }
  let queued = null;                      // a spin that arrived before the last one had finished here
  let tableBets = [];                     // what the others at the table have down: [{ id, name, bets }]
  const wheelBets = new Map();            // (host) each guest's bets
  let wheelBusy = 0;                      // (host) no new spin before this time
  const lastNumbers = [], spotEls = {};
  const sum = (b) => Object.values(b).reduce((x, y) => x + y, 0), wagered = () => sum(bets);
  // Bets as they arrive from someone else: only real spots, whole positive amounts.
  const cleanBets = (raw) => {
    const out = {};
    if (raw && typeof raw === 'object') for (const s of SPOTS) { const amount = Math.floor(Number(raw[s.id])); if (amount > 0) out[s.id] = Math.min(amount, C.maxBet); }
    return out;
  };

  // (Host) tell everyone what's on the felt.
  function shareWheel() {
    if (role !== 'host' || !net) return;
    const all = [{ id: myId, name: myName(), bets: room.roulette ? bets : {} }, ...[...wheelBets].map(([id, b]) => ({ id, name: people.get(id)?.name || 'Player', bets: b }))];
    net.broadcast({ t: 'rbets', all });
    tableBets = all.filter((p) => p.id !== myId);
  }
  // Your bets changed (or you walked up, or away: your chips are only down while you're at the table).
  function sendBets() {
    if (role === 'guest') net?.send({ t: 'rbet', bets: room.roulette ? bets : {} });
    else shareWheel();
    refresh();
  }

  function placeBet(id, take) {
    if (!room.roulette || rolling) return;
    if (take) delete bets[id];
    else {
      const amount = Math.min(chip, C.maxBet - wagered(), profile.gold - wagered());   // (the table limit, and what you've got)
      if (amount <= 0) return;
      bets[id] = (bets[id] || 0) + amount;
    }
    $('casino-roulette-result').textContent = 'Place your bets';
    playChip();
    sendBets();
  }
  for (const s of SPOTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = s.kind;
    b.style.gridColumn = `${s.x + 1} / span ${s.w}`;
    b.style.gridRow = `${s.y + 1} / span ${s.h}`;
    b.innerHTML = `${s.label}<i></i>`;
    b.addEventListener('click', () => placeBet(s.id, false));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); placeBet(s.id, true); });
    $('casino-board').append(b);
    spotEls[s.id] = b;
  }
  for (const value of WHEEL_CHIPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${COIN}${value}`;
    b.addEventListener('click', () => { chip = value; refresh(); });
    $('casino-roulette-chips').append(b);
  }
  $('casino-roulette-clear').addEventListener('click', () => { if (!rolling) { bets = {}; sendBets(); } });

  // You want the wheel spun.
  function spinRoulette() {
    if (!room.roulette || rolling || !wagered() || wagered() > profile.gold) return;
    if (role === 'guest') net?.send({ t: 'rspin' });
    else hostSpin(myId);
  }
  $('casino-roulette-spin').addEventListener('click', spinRoulette);

  // (Host, or alone) spin it for everyone, if it isn't already spinning.
  function hostSpin(id) {
    const now = performance.now();
    if (now < wheelBusy || (id !== myId && !sum(wheelBets.get(id) || {}))) return;
    wheelBusy = now + 8300;
    const number = spinWheel();   // (decided now; the ball catches up)
    if (role === 'host') net.broadcast({ t: 'rspin', number });
    startSpin(number);
  }

  // The wheel is spinning, here. If you're at the table with bets down, they're on.
  function startSpin(number) {
    if (!Number.isInteger(number) || number < 0 || number > 36) return;
    if (rolling) { queued = number; return; }
    const total = room.roulette ? wagered() : 0, playing = total > 0 && pay(total, () => {}), back = playing ? settle(bets, number) : 0;
    rolling = { number, total, back, paid: false, playing };
    room.spinRoulette(number, `${number} ${colour(number)}`, playing && back > total ? `+${back - total} gold` : '', playing && back === 0, room.roulette);
    if (room.roulette) playWheel();
    for (const el of Object.values(spotEls)) el.classList.remove('hit');
    $('casino-roulette-result').textContent = 'No more bets';
    refresh();
  }

  function runRoulette() {
    if (!rolling) return;
    const { number, total, back, playing } = rolling;
    if (!rolling.paid && room.called) {   // the number's called: settle up
      rolling.paid = true;
      lastNumbers.unshift(number);
      lastNumbers.length = Math.min(lastNumbers.length, 10);
      spotEls[`n${number}`].classList.add('hit');
      $('casino-roulette-history').innerHTML = lastNumbers.map((n) => `<b class="${colour(n)}">${n}</b>`).join('');
      $('casino-roulette-result').textContent = `${number} ${colour(number)}${!playing ? '' : `: ${back > total ? `you win ${back - total}` : back === total ? 'you break even' : back ? `you get ${back} back` : 'the house wins'}`}`;
      if (playing) {
        bank(back);
        houseTook(total - back, total);
        if (back >= total * 6) playJackpot();
        else if (back > total) playCashIn();
        else if (back) playCoin(0.4);
        else playLose();
      }
      refresh();
    }
    if (room.rtime < 0) {   // and it's over: the same bets stay down if you can cover them
      rolling = null;
      if (wagered() > profile.gold) bets = {};
      sendBets();
      if (queued !== null) { const next = queued; queued = null; startSpin(next); }
    }
  }

  function refreshRoulette() {
    $('casino-roulette').classList.toggle('hidden', !room.roulette);
    const theirs = {};
    for (const p of tableBets) for (const [id, amount] of Object.entries(p.bets)) theirs[id] = (theirs[id] || 0) + amount;
    room.showBets(room.roulette ? bets : {}, theirs);
    if (!room.roulette) return;
    for (const s of SPOTS) {
      const el = spotEls[s.id], amount = bets[s.id] || 0;
      el.lastChild.textContent = amount || '';
      el.classList.toggle('bet', !!amount);
      el.classList.toggle('theirs', !!theirs[s.id]);
      el.disabled = !!rolling;
    }
    [...$('casino-roulette-chips').children].forEach((b, i) => b.classList.toggle('on', WHEEL_CHIPS[i] === chip));
    $('casino-roulette-total').innerHTML = `Bet ${COIN}${wagered()} <small>/ ${C.maxBet}</small>`;
    $('casino-roulette-spin').disabled = !!rolling || !wagered();
    $('casino-roulette-clear').disabled = !!rolling || !wagered();
    const others = tableBets.filter((p) => sum(p.bets) > 0);
    $('casino-roulette-others').textContent = others.length ? `Also betting:  ${others.map((p) => `${p.name} ${sum(p.bets)}`).join('  \u00b7  ')}` : '';
  }

  // Make the screen match the game.
  function refresh() {
    const s = view.state, mine = mySeat(), seated = seat >= 0, friends = role !== 'alone';
    room.showTable(s);
    room.setWealth(profile.houseTake);
    $('casino-gold').innerHTML = `${COIN}${profile.gold.toLocaleString()}`;
    $('casino-house').innerHTML = `Babitus has taken ${COIN}${Math.max(0, profile.houseTake).toLocaleString()}`;
    $('casino-table').classList.toggle('hidden', !seated);
    $('casino-stand').classList.toggle('hidden', !seated && room.bar < 0 && room.lounge < 0 && room.slot < 0 && !room.roulette);
    $('casino-smoke').classList.toggle('hidden', !seated && room.bar < 0 && room.lounge < 0);
    $('casino-sip').classList.toggle('hidden', !seated && room.lounge < 0);
    $('casino-view').textContent = room.firstPerson ? 'Third person' : 'First person';
    $('casino-stand').textContent = seated ? 'Leave table' : room.slot >= 0 || room.roulette ? 'Walk away' : 'Get up';
    refreshBar();
    refreshSlots();
    refreshRoulette();
    $('casino-stand').disabled = staked > 0;

    // Playing with friends: the code to give out, and who's here.
    $('casino-net-idle').classList.toggle('hidden', friends);
    $('casino-net-live').classList.toggle('hidden', !friends);
    $('casino-friends').textContent = friends && code ? `Table ${code}` : 'Play with friends';
    if (friends) $('casino-room').textContent = code ? `Table code ${code}  ·  ${people.size || 1} here${role === 'host' ? '  ·  give the code to your friends' : ''}` : '';
    if (!seated) return;

    const now = currentHand(mine);   // the hand you're playing (there are two after a split)
    const betting = s.phase === 'betting' && !mine.ready, myTurn = s.phase === 'playing' && s.turn === seat && now.status === 'playing' && !view.busy;
    $('casino-betting').classList.toggle('hidden', !betting);
    $('casino-actions').classList.toggle('hidden', !myTurn);
    $('casino-bet').innerHTML = `${COIN}${(betting ? bet : mine.bet + (mine.second?.bet || 0)).toLocaleString()}`;
    $('casino-deal').disabled = bet < C.minBet || bet > profile.gold;
    for (const b of document.querySelectorAll('#casino-chips button[data-chip]')) b.disabled = bet + Number(b.dataset.chip) > Math.min(C.maxBet, profile.gold);
    $('casino-double').disabled = !myTurn || now.cards.length !== 2 || profile.gold < now.bet;
    $('casino-split').disabled = !myTurn || !canSplit(mine) || profile.gold < mine.bet;

    const dealer = handTotal(s.dealer), turnSeat = s.seats[s.turn];
    const total = (h) => { const t = handTotal(h.cards); return `${t.soft && t.total < 21 ? 'Soft ' : ''}${t.total}`; };
    // After a split, both totals, with the hand you're on in brackets.
    $('casino-you').textContent = !mine.cards.length ? '' : !mine.second ? total(mine)
      : [mine, mine.second].map((h) => (myTurn && h === now ? `[${total(h)}]` : total(h))).join('  ');
    $('casino-dealer').textContent = s.dealer.length ? String(dealer.total) : '';
    $('casino-status').textContent = betting ? (profile.gold < C.minBet ? `You need ${C.minBet} gold to play` : `Place your bet (${C.minBet} to ${C.maxBet})${s.countdown > 0 ? `  ·  dealing in ${Math.ceil(s.countdown)}` : ''}`)
      : s.phase === 'betting' ? (s.countdown > 0 ? `Waiting for the others  ·  dealing in ${Math.ceil(s.countdown)}` : 'Waiting...')
        : s.phase === 'dealing' ? 'Dealing...'
          : myTurn ? `Your move${mine.second ? (mine.active ? ': second hand' : ': first hand') : ''}${s.seats.filter((x) => x && x.ready).length > 1 ? `  ·  ${Math.ceil(s.turnLeft)}` : ''}`
            : s.phase === 'playing' && turnSeat ? `${turnSeat.name}'s turn` : s.phase === 'dealer' ? "Dealer's turn" : '';
  }

  // The bar menu: shown while you're on a bar stool.
  function refreshBar() {
    const atBar = room.bar >= 0;
    $('casino-bar').classList.toggle('hidden', !atBar);
    if (!atBar) return;
    const busy = room.barShop.busy || room.drinking > 0 || room.cutOff > 0;
    for (const b of document.querySelectorAll('#casino-drinks button')) b.disabled = busy || profile.gold < Number(b.dataset.price);
    $('casino-drink').classList.toggle('hidden', !room.canDrink);
    $('casino-bar-status').textContent = room.cutOff > 0 ? `You've had enough. Come back in ${Math.ceil(room.cutOff)}` : room.barShop.busy ? 'Coming right up...' : room.canDrink ? '' : room.drinking > 0 ? '' : "What'll it be?";
  }
  $('casino-drinks').replaceChildren(...DRINKS.map((drink) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.price = drink.price;
    b.innerHTML = `${drink.name} ${COIN}${drink.price}`;
    b.addEventListener('click', () => order(drink));
    return b;
  }));
  $('casino-drink').addEventListener('click', () => { room.drink(); refresh(); });

  // Build the chip buttons once.
  $('casino-chips').replaceChildren(...CHIPS.map((value) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-button';
    b.dataset.chip = value;
    b.textContent = `+${value}`;
    b.addEventListener('click', () => setBet(bet + value));
    return b;
  }), Object.assign(document.createElement('button'), { type: 'button', className: 'chip-button clear', textContent: 'Clear', onclick: () => setBet(0) }));
  $('casino-deal').addEventListener('click', deal);
  $('casino-hit').addEventListener('click', () => play('hit'));
  $('casino-stay').addEventListener('click', () => play('stand'));
  $('casino-double').addEventListener('click', () => play('double'));
  $('casino-split').addEventListener('click', () => play('split'));
  $('casino-stand').addEventListener('click', standUp);
  const toggleView = () => { room.firstPerson = !room.firstPerson; refresh(); };
  $('casino-view').addEventListener('click', toggleView);
  $('casino-smoke').addEventListener('click', () => room.smoke());
  $('casino-sip').addEventListener('click', () => room.tableDrink());
  $('casino-leave').addEventListener('click', () => leave());
  $('casino-friends').addEventListener('click', () => $('casino-net').classList.toggle('hidden'));
  $('casino-host').addEventListener('click', () => connect(true));
  $('casino-join').addEventListener('click', () => { const typed = $('casino-code').value.trim(); if (typed.length >= 4) connect(false, typed); else netStatus('Type the table code first'); });
  $('casino-quit').addEventListener('click', () => { if (staked === 0) goAlone(''); });
  const codeBox = $('casino-code');
  codeBox.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') $('casino-join').click(); });   // (typing a code isn't walking or playing)
  codeBox.addEventListener('keyup', (e) => e.stopPropagation());

  let active = false;

  // Keep the table going (when this browser is running it).
  function runTable(dt) {
    if (!engine) return;
    engine.tick(dt);
    const s = engine.state, clock = `${Math.ceil(s.countdown)}:${Math.ceil(s.turnLeft)}`;   // (send the countdowns on when a second ticks over)
    if (outbox.length || clock !== lastClock) { lastClock = clock; flush(); }
  }
  // A browser stops drawing a tab you've switched away from, which would freeze a hosted
  // table for everyone. So while this tab is hidden, a slow timer keeps the host's table running.
  let lastHidden = 0;
  setInterval(() => {
    const now = performance.now();
    if (active && role === 'host' && document.hidden && lastHidden) {
      runTable(Math.min(2, (now - lastHidden) / 1000));
      people.set(myId, me());
      if (code) net.broadcast({ t: 'people', list: [...people.values()] });
    }
    lastHidden = now;
  }, 250);

  // Hold the left mouse button on the room (not on a button) and drag to look around.
  let dragging = false;
  const canvas = document.getElementById('game');
  canvas.addEventListener('pointerdown', (e) => {
    if (!active || e.button !== 0) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => { if (active && dragging) room.look(e.movementX, e.movementY); });
  const release = () => { dragging = false; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  window.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.code === 'Escape') { standUp(); return; }   // (gets you up from wherever you are sat; it doesn't leave the casino: there's a button for that)
    if (e.code === 'KeyF' && (seat >= 0 || room.bar >= 0 || room.lounge >= 0)) { room.smoke(); return; }
    if (e.code === 'KeyG' && (seat >= 0 || room.lounge >= 0)) { room.tableDrink(); return; }   // (the whisky by his cards, or on the table in front of his sofa)
    if (room.roulette && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); spinRoulette(); return; }
    if (room.slot >= 0 && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); pullLever(); return; }
    if (e.code === 'KeyV') { toggleView(); return; }
    if (seat < 0) return;
    if (view.state.phase === 'betting' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); deal(); }

    else if (e.code === 'KeyH') play('hit');
    else if (e.code === 'KeyS') play('stand');
    else if (e.code === 'KeyD') play('double');
    else if (e.code === 'KeyP') play('split');
  });

  function leave() {
    if (staked > 0) return;   // finish the hand first
    if (role !== 'alone') goAlone('');
    active = false;
    document.body.classList.remove('in-casino', 'casino-cine', 'casino-woozy', 'casino-tipsy');
    $('casino').classList.add('hidden');
    onLeave();
  }

  return {
    scene: room.scene,
    camera: room.camera,
    get active() { return active; },
    room,   // (handy in the browser console)
    // Play an emote (see player/emotes.js). A smoke at the blackjack table gets the full cut-in.
    emote(i) {
      if (!active || room.smokeLeft > 0 || room.cine.on) return;
      if (EMOTES[i]?.id === 'smoke' && (seat >= 0 || room.bar >= 0)) room.smoke();
      else room.emoter.play(i);
    },
    get table() { return engine; },

    enter() {
      active = true;
      setMusicStyle('casino');
      document.body.classList.add('in-casino');
      seat = -1; bet = 0; lastBet = 0; staked = 0;
      room.reset();
      room.kirky.applyLook(currentLook());
      $('casino').classList.remove('hidden');
      $('casino-net').classList.add('hidden');
      $('casino-banner').classList.remove('show');
      $('casino-laugh').classList.remove('show');
      goAlone('');
    },

    update(dt, input) {
      runTable(dt);

      // Everyone else in the room, at their seat if they have one.
      const others = [...people.values()].filter((p) => p.id !== myId).map((p) => ({ ...p, seat: seatOf(p.id) }));
      room.update(dt, input, others);

      // A few times a second, tell the others where you are (a guest tells the host; the host tells everyone).
      if (role !== 'alone' && (sinceSync += dt) > 0.1) {
        sinceSync = 0;
        if (role === 'host' && code) {
          people.set(myId, me());
          net.broadcast({ t: 'people', list: [...people.values()] });
        } else if (role === 'guest') net.send({ t: 'here', ...doing() });
      }

      // Walking about: offer the free stool you're standing next to, at the table or at the bar.
      runSlots(dt);
      runRoulette();
      const walking = seat < 0 && room.bar < 0 && room.lounge < 0 && room.slot < 0 && !room.roulette;
      const near = walking ? room.nearSeat(view.state.seats.map(Boolean)) : -1;
      const barTaken = [];
      for (const p of others) if (p.seat < 0 && p.bar >= 0) barTaken[p.bar] = true;
      const nearBar = walking && near < 0 ? room.nearBar(barTaken) : -1;
      const nearSlot = walking && near < 0 && nearBar < 0 ? room.nearSlot() : -1;
      const nearRoulette = walking && near < 0 && nearBar < 0 && nearSlot < 0 && room.nearRoulette();
      const sofaTaken = [];
      for (const p of others) if (p.seat < 0 && p.lounge >= 0) sofaTaken[p.lounge] = true;
      const nearSofa = walking && near < 0 && nearBar < 0 && nearSlot < 0 && !nearRoulette ? room.nearLounge(sofaTaken) : -1;
      $('casino-prompt').classList.toggle('hidden', near < 0 && nearBar < 0 && nearSlot < 0 && !nearRoulette && nearSofa < 0);
      $('casino-prompt-text').textContent = near >= 0 ? 'Take a seat at the table' : nearBar >= 0 ? 'Sit at the bar' : nearSlot >= 0 ? 'Play the slots' : nearSofa >= 0 ? 'Sit down' : 'Play roulette';
      if (input.trickPressed) {
        input.trickPressed = false;
        if (near >= 0) request(myId, 'sit', near);
        else if (nearBar >= 0) { room.sitBar(nearBar); refresh(); }
        else if (nearSlot >= 0) { room.playSlot(nearSlot); refresh(); }
        else if (nearRoulette) { room.playRoulette(others); sendBets(); }
        else if (nearSofa >= 0) { room.sitLounge(nearSofa); refresh(); }
        else if (room.slot >= 0) pullLever();   // E at a machine: pull
        else if (room.canDrink) room.drink();   // E at the bar: drink up
      }
      if (room.bar >= 0) refreshBar();

      // A cut-in is being filmed: clear the buttons away and dress the screen for it.
      const cine = room.cine;
      document.body.classList.toggle('casino-cine', cine.on);
      document.body.classList.toggle('casino-woozy', cine.on && cine.blur);          // seeing double
      document.body.classList.toggle('casino-tipsy', !cine.on && room.drunk > 0);    // and, afterwards, not quite straight
      if (cine.on) {
        $('casino-lines').style.opacity = cine.lines;
        $('casino-flash').style.opacity = cine.flash;
        const title = $('casino-title');
        if (title.textContent !== cine.title) { title.textContent = cine.title; title.classList.toggle('show', !!cine.title); }
      }
    },
  };
}
