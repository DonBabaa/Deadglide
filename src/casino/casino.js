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
import { config } from '../config.js';
import { CasinoRoom } from './room.js';
import { DRINKS } from './bar.js';
import { Blackjack, handTotal, canSplit, currentHand } from './blackjack.js';
import { Net } from './net.js';
import { profile, pay, bank, houseTook } from '../systems/profile.js';
import { currentLook } from '../systems/cosmetics.js';
import { getName } from '../ui/playerName.js';
import { setMusicStyle } from '../fx/music.js';
import { playCard, playChip, playCashIn, playCoin, playLose, playPowerup, playLaugh } from '../fx/audio.js';

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
      houseTook(staked - e.payout);
      const net2 = e.payout - staked;
      banner({ blackjack: 'Blackjack!', win: 'You win', push: 'Push', lose: e.split ? 'You lose' : handTotal(me.cards).total > 21 ? 'Bust' : 'Dealer wins' }[e.result], net2);
      if (e.result === 'blackjack') { playPowerup(); playCashIn(); }
      else if (e.result === 'win') playCashIn();
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
      if (role === 'host') { people = new Map([[myId, me()]]); newEngine(); }
      else net.send({ t: 'hello', name: myName(), look: myLook() });
      netStatus('');
      refresh();
    },
    join() {},   // (a guest says hello once connected: see 'hello' below)
    leave(id) {
      people.delete(id);
      request(id, 'stand');
    },
    message(id, m) {
      if (!m || typeof m !== 'object') return;
      if (role === 'host') {
        if (m.t === 'hello') {
          people.set(id, { id, name: String(m.name || 'Player').slice(0, 16), look: m.look || {}, x: 0, z: 12, yaw: Math.PI });
          net.sendTo(id, { t: 'welcome', id });
          net.sendTo(id, { t: 'table', state: structuredClone(engine.state), busy: engine.steps.length > 0, events: [] });
          refresh();
        } else if (m.t === 'here' && people.has(id)) Object.assign(people.get(id), { x: Number(m.x) || 0, z: Number(m.z) || 0, yaw: Number(m.yaw) || 0, bar: Number.isInteger(m.bar) ? m.bar : -1 });
        else if (['sit', 'stand', 'act'].includes(m.t) && people.has(id)) request(id, m.t, m.arg, m.amount);
      } else if (m.t === 'welcome') myId = m.id;
      else if (m.t === 'table') deliver({ state: m.state, busy: m.busy }, m.events || []);
      else if (m.t === 'people') { people = new Map(m.list.map((p) => [p.id, p])); refresh(); }
    },
    closed(why) { goAlone(why); },
  };

  const me = () => ({ id: myId, name: myName(), look: myLook(), x: room.pos.x, z: room.pos.z, yaw: room.yaw, bar: room.bar });

  function connect(asHost, joinCode) {
    if (staked > 0 || role !== 'alone') return;   // finish the hand first
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
    if (room.bar >= 0) { room.stand(); refresh(); return; }   // off a bar stool
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

  // Make the screen match the game.
  function refresh() {
    const s = view.state, mine = mySeat(), seated = seat >= 0, friends = role !== 'alone';
    room.showTable(s);
    room.setWealth(profile.houseTake);
    $('casino-gold').innerHTML = `${COIN}${profile.gold.toLocaleString()}`;
    $('casino-house').innerHTML = `Babitus has taken ${COIN}${Math.max(0, profile.houseTake).toLocaleString()}`;
    $('casino-table').classList.toggle('hidden', !seated);
    $('casino-stand').classList.toggle('hidden', !seated && room.bar < 0);
    $('casino-stand').textContent = seated ? 'Leave table' : 'Get up';
    refreshBar();
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
    const busy = room.barShop.busy || room.drinking > 0;
    for (const b of document.querySelectorAll('#casino-drinks button')) b.disabled = busy || profile.gold < Number(b.dataset.price);
    $('casino-drink').classList.toggle('hidden', !room.canDrink);
    $('casino-bar-status').textContent = room.barShop.busy ? 'Coming right up...' : room.canDrink ? '' : room.drinking > 0 ? '' : "What'll it be?";
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
    if (e.code === 'Escape') { seat >= 0 || room.bar >= 0 ? standUp() : leave(); return; }
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
    document.body.classList.remove('in-casino', 'casino-cine');
    $('casino').classList.add('hidden');
    onLeave();
  }

  return {
    scene: room.scene,
    camera: room.camera,
    get active() { return active; },
    room,   // (handy in the browser console)
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
        } else if (role === 'guest') net.send({ t: 'here', x: room.pos.x, z: room.pos.z, yaw: room.yaw, bar: room.bar });
      }

      // Walking about: offer the free stool you're standing next to, at the table or at the bar.
      const walking = seat < 0 && room.bar < 0;
      const near = walking ? room.nearSeat(view.state.seats.map(Boolean)) : -1;
      const barTaken = [];
      for (const p of others) if (p.seat < 0 && p.bar >= 0) barTaken[p.bar] = true;
      const nearBar = walking && near < 0 ? room.nearBar(barTaken) : -1;
      $('casino-prompt').classList.toggle('hidden', near < 0 && nearBar < 0);
      $('casino-prompt-text').textContent = near >= 0 ? 'Take a seat at the table' : 'Sit at the bar';
      if (input.trickPressed) {
        input.trickPressed = false;
        if (near >= 0) request(myId, 'sit', near);
        else if (nearBar >= 0) { room.sitBar(nearBar); refresh(); }
        else if (room.canDrink) room.drink();   // E at the bar: drink up
      }
      if (room.bar >= 0) refreshBar();

      // A cut-in is being filmed: clear the buttons away and dress the screen for it.
      const cine = room.cine;
      document.body.classList.toggle('casino-cine', cine.on);
      if (cine.on) {
        $('casino-lines').style.opacity = cine.lines;
        $('casino-flash').style.opacity = cine.flash;
        const title = $('casino-title');
        if (title.textContent !== cine.title) { title.textContent = cine.title; title.classList.toggle('show', !!cine.title); }
      }
    },
  };
}
