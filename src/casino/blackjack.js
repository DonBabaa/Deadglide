// Blackjack: the rules, and one table's worth of state. Nothing here draws
// anything or knows about gold; it only knows cards, bets and whose turn it is.
// (That is deliberate: when tables go multiplayer the host runs this and sends
// `state` to everyone else.)
//
// Rules: six decks, dealer stands on 17, blackjack pays 3 to 2, double down on
// your first two cards. No insurance. The dealer starts with one card and only
// takes his second once every player has finished.
//
// Splitting: two cards of the same value can be split into two hands, once, for
// a second stake the same as the first. Each hand is then played in turn. Split
// aces get one card each and no more. A 21 on a split hand is just 21, not a
// blackjack. You can double on a split hand.
//
// A round: 'betting' -> 'dealing' -> 'playing' (each seat in turn) -> 'dealer'
// -> 'payout' -> back to 'betting'. Call tick(dt) every frame: cards are dealt
// one at a time, with a pause between them.

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];
const PACE = 0.42;   // seconds between cards
const BET_TIME = 10;   // once someone is ready, the others have this long to get their bets down
const SHOWDOWN = 3.7;   // seconds the table waits while the dealer gloats over a 21 made with three cards or more
const TURN_TIME = 20;  // with several players, how long each has to act before they stand automatically

const cardValue = (c) => (c.r === 'A' ? 11 : 'JQK'.includes(c.r) || c.r === '10' ? 10 : Number(c.r));
// Can this seat split right now? (Its first two cards, the same value, not split already.)
export const canSplit = (seat) => !!seat && seat.status === 'playing' && !seat.second && seat.cards.length === 2 && cardValue(seat.cards[0]) === cardValue(seat.cards[1]);
// The hand a seat is playing at the moment: its first, or its second after a split.
export const currentHand = (seat) => (seat.second && seat.active === 1 ? seat.second : seat);

// What a hand is worth. soft: an ace is being counted as 11.
export function handTotal(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.r === 'A') { total += 11; aces++; }
    else total += 'JQK'.includes(c.r) || c.r === '10' ? 10 : Number(c.r);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
const natural = (cards) => cards.length === 2 && handTotal(cards).total === 21;

export class Blackjack {
  // onEvent({ type, seat, ... }) is called as things happen: 'roundStart', 'card', 'double', 'dealerBlackjack', 'dealerShowdown', 'result', 'roundEnd',
  // and 'update' after every timed step (so whoever is drawing the table knows to look again).
  constructor({ seats = 5, decks = 6, minBet = 10, maxBet = 500, onEvent = () => {} } = {}) {
    this.rules = { decks, minBet, maxBet };
    this.onEvent = onEvent;
    this.shoe = [];
    this.steps = [];   // things still to happen this round: [seconds to wait first, function]
    this.wait = 0;
    // seats[i]: null (empty) or { id, name, bet, ready, cards, status, result, payout, second, active }      (id: whose seat it is)
    //   second: after a split, the second hand { cards, bet, status, result, payout }; active: which hand is being played (0 or 1)
    //   status: 'waiting' | 'playing' | 'stand' | 'bust' | 'blackjack'      result: 'win' | 'lose' | 'push' | 'blackjack'
    // countdown: seconds until the deal, once it's running. turnLeft: seconds the player whose turn it is has left.
    this.state = { phase: 'betting', round: 0, turn: -1, countdown: 0, turnLeft: 0, dealer: [], seats: Array(seats).fill(null) };
  }

  sit(index, name, id = '') {
    if (!(index >= 0 && index < this.state.seats.length) || this.state.seats[index]) return false;
    this.state.seats[index] = { id, name, bet: 0, ready: false, cards: [], status: 'waiting', result: null, payout: 0, second: null, active: 0 };
    return true;
  }

  leave(index) {
    const s = this.state, wasTurn = s.phase === 'playing' && s.turn === index;
    s.seats[index] = null;
    if (wasTurn) this.nextTurn();
    else if (s.phase === 'betting') this.maybeStart();
  }

  // A player does something. Returns false if it isn't allowed right now.
  //   'bet' (amount)  set your bet        'ready'  you're done betting: deal when everyone is
  //   'hit'  'stand'  'double'  'split'   on your turn (they act on the hand you're playing)
  act(index, action, amount = 0) {
    const s = this.state, seat = s.seats[index];
    if (!seat) return false;
    if (s.phase === 'betting') {
      if (action === 'bet' && !seat.ready) {
        seat.bet = Math.max(0, Math.min(this.rules.maxBet, Math.floor(amount)));
        return true;
      }
      if (action === 'ready' && seat.bet >= this.rules.minBet) {
        seat.ready = true;
        this.maybeStart();
        return true;
      }
      return false;
    }
    if (s.phase !== 'playing' || s.turn !== index || this.steps.length) return false;
    const hand = currentHand(seat);
    if (hand.status !== 'playing') return false;
    if (action === 'hit') {
      this.dealTo(index, seat.active);
      const { total } = handTotal(hand.cards);
      if (total > 21) hand.status = 'bust';
      else if (total === 21) hand.status = 'stand';
      if (hand.status !== 'playing') this.handDone(index);
      else s.turnLeft = TURN_TIME;
      return true;
    }
    if (action === 'stand') {
      hand.status = 'stand';
      this.handDone(index);
      return true;
    }
    if (action === 'double' && hand.cards.length === 2) {
      this.onEvent({ type: 'double', seat: index, extra: hand.bet });
      hand.bet *= 2;
      this.dealTo(index, seat.active);
      hand.status = handTotal(hand.cards).total > 21 ? 'bust' : 'stand';
      this.handDone(index);
      return true;
    }
    if (action === 'split' && canSplit(seat)) {
      this.onEvent({ type: 'split', seat: index, extra: seat.bet });
      const aces = seat.cards[0].r === 'A';
      seat.second = { cards: [seat.cards.pop()], bet: seat.bet, status: 'playing', result: null, payout: 0 };
      seat.active = 0;
      // A card on each. Aces stop there; any other hand that makes 21 stands by itself.
      this.later(PACE, () => this.dealTo(index, 0));
      this.later(PACE, () => {
        this.dealTo(index, 1);
        for (const h of [seat, seat.second]) if (aces || handTotal(h.cards).total === 21) h.status = 'stand';
        if (seat.status !== 'playing') this.handDone(index);
        else s.turnLeft = TURN_TIME;
      });
      return true;
    }
    return false;
  }

  // The hand a seat was playing is finished: on to its second hand if it has one waiting, otherwise the next seat.
  handDone(index) {
    const s = this.state, seat = s.seats[index];
    if (seat.second && seat.active === 0) {
      seat.active = 1;
      if (seat.second.status === 'playing') { s.turnLeft = TURN_TIME; return; }
    }
    this.nextTurn();
  }

  tick(dt) {
    const s = this.state;
    if (s.phase === 'betting' && s.countdown > 0 && (s.countdown -= dt) <= 0) this.maybeStart(true);   // time's up: deal to whoever has a bet down
    if (s.phase === 'playing' && s.turn >= 0 && !this.steps.length && this.playing().length > 1 && (s.turnLeft -= dt) <= 0) {
      currentHand(s.seats[s.turn]).status = 'stand';   // took too long: they stand
      this.handDone(s.turn);
      this.onEvent({ type: 'update' });
    }
    if (!this.steps.length) return;
    this.wait -= dt;
    while (this.steps.length && this.wait <= 0) {
      const [, run] = this.steps.shift();
      run();
      this.onEvent({ type: 'update' });   // (something on the table changed)
      this.wait += this.steps.length ? this.steps[0][0] : 0;
    }
    if (!this.steps.length) this.wait = 0;
  }

  // ---- Inside ---------------------------------------------------------------------

  later(seconds, run) {
    if (!this.steps.length) this.wait = seconds;
    this.steps.push([seconds, run]);
  }

  draw() {
    if (this.shoe.length < 60) {   // a fresh, shuffled shoe
      this.shoe = [];
      for (let d = 0; d < this.rules.decks; d++) for (const s of SUITS) for (const r of RANKS) this.shoe.push({ r, s });
      for (let i = this.shoe.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.shoe[i], this.shoe[j]] = [this.shoe[j], this.shoe[i]];
      }
    }
    return { ...this.shoe.pop() };
  }

  // which: 0 = the seat's first hand, 1 = its second (after a split).
  dealTo(index, which = 0) {
    const card = this.draw(), seat = this.state.seats[index];
    (index < 0 ? this.state.dealer : which === 1 ? seat.second.cards : seat.cards).push(card);
    this.onEvent({ type: 'card', seat: index });
  }

  playing() { return this.state.seats.map((seat, i) => (seat && seat.bet > 0 && seat.ready ? i : -1)).filter((i) => i >= 0); }

  // Deal once everyone at the table is ready. If only some are, a countdown starts; when it
  // runs out (force), anyone with a bet down is in and the rest sit this hand out.
  maybeStart(force = false) {
    const s = this.state, seated = s.seats.filter(Boolean);
    if (s.phase !== 'betting') return;
    if (!seated.some((seat) => seat.ready)) { s.countdown = 0; return; }
    if (seated.some((seat) => !seat.ready) && !force) {
      if (s.countdown <= 0) s.countdown = BET_TIME;
      return;
    }
    for (const seat of seated) if (seat.bet >= this.rules.minBet) seat.ready = true;
    s.countdown = 0;
    const players = this.playing();
    s.phase = 'dealing';
    s.round++;
    s.dealer = [];
    for (const i of players) Object.assign(s.seats[i], { cards: [], status: 'playing', result: null, payout: 0, second: null, active: 0 });
    this.onEvent({ type: 'roundStart' });
    // One card each, one for the dealer, then a second card each. (The dealer's second waits.)
    for (const i of players) this.later(PACE, () => this.dealTo(i));
    this.later(PACE, () => this.dealTo(-1));
    for (const i of players) this.later(PACE, () => this.dealTo(i));
    this.later(PACE, () => {
      for (const i of players) if (natural(s.seats[i].cards)) s.seats[i].status = 'blackjack';
      s.phase = 'playing';
      s.turn = -1;
      this.nextTurn();
    });
  }

  nextTurn() {
    const s = this.state, players = this.playing();
    const next = players.find((i) => i > s.turn && s.seats[i].status === 'playing');
    if (next !== undefined) { s.turn = next; s.turnLeft = TURN_TIME; return; }
    // Everyone has played: the dealer's turn.
    s.turn = -1;
    s.turnLeft = 0;
    s.phase = 'dealer';
    this.dealerDraws();
  }

  dealerDraws() {
    const s = this.state, players = this.playing().flatMap((i) => [s.seats[i].status, s.seats[i].second?.status]);   // (every hand on the table)
    const someoneStanding = players.includes('stand'), stillIn = someoneStanding || players.includes('blackjack');
    // If everyone has bust he doesn't need another card. Otherwise his second comes out (it decides a
    // player's blackjack too), and he draws on up to 17 only if someone is standing against him.
    if ((stillIn && s.dealer.length < 2) || (someoneStanding && handTotal(s.dealer).total < 17)) {
      this.later(PACE * 1.5, () => { this.dealTo(-1); this.dealerDraws(); });
      return;
    }
    // Twenty-one the hard way, with three cards or more: he takes a moment to enjoy it before paying out.
    if (s.dealer.length >= 3 && handTotal(s.dealer).total === 21) {
      this.later(PACE * 1.2, () => this.onEvent({ type: 'dealerShowdown', cards: s.dealer.length }));
      this.later(SHOWDOWN, () => this.settle());
      return;
    }
    this.later(PACE * 1.5, () => this.settle());
  }

  settle() {
    const s = this.state, dealer = handTotal(s.dealer).total, dealerNatural = natural(s.dealer);
    if (dealerNatural) this.onEvent({ type: 'dealerBlackjack' });   // (he laughs; a longer 21 has already had its moment: see dealerDraws)
    // Settle one hand against the dealer.
    const judge = (hand) => {
      const mine = handTotal(hand.cards).total;
      if (hand.status === 'blackjack') hand.result = dealerNatural ? 'push' : 'blackjack';
      else if (hand.status === 'bust') hand.result = 'lose';
      else if (dealerNatural) hand.result = 'lose';
      else if (dealer > 21 || mine > dealer) hand.result = 'win';
      else hand.result = mine === dealer ? 'push' : 'lose';
      hand.payout = { blackjack: Math.floor(hand.bet * 2.5), win: hand.bet * 2, push: hand.bet, lose: 0 }[hand.result];   // (what comes back, stake included)
    };
    for (const i of this.playing()) {
      const seat = s.seats[i];
      judge(seat);
      if (seat.second) judge(seat.second);
      // One result per seat: for a split, how the two hands came out together.
      const payout = seat.payout + (seat.second?.payout || 0), bet = seat.bet + (seat.second?.bet || 0);
      const result = seat.second ? (payout > bet ? 'win' : payout < bet ? 'lose' : 'push') : seat.result;
      this.onEvent({ type: 'result', seat: i, result, payout, bet, split: !!seat.second });
    }
    s.phase = 'payout';
    this.later(3.2, () => {
      s.phase = 'betting';
      s.dealer = [];
      for (const seat of s.seats) if (seat) Object.assign(seat, { bet: 0, ready: false, cards: [], status: 'waiting', result: null, payout: 0, second: null, active: 0 });
      this.onEvent({ type: 'roundEnd' });
    });
  }
}
