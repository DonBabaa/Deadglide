// The shop (on the main menu): spend banked gold on permanent upgrades,
// one-off unlocks and guns. What it sells is listed in systems/profile.js.
import { profile, PERMANENT, UNLOCKS, GUNS, level, hasUnlock, gunUnlocked, nextPrice, buyUpgrade, buyUnlock, buyGun, buyStart, chooseStart } from '../systems/profile.js';
import { SLOTS, GOLD_GUNS, GOLD_SKIN_PRICE, owns, wearing, wear, buy, ownsGold, goldOn, buyGold, toggleGold } from '../systems/cosmetics.js';
import { playChest, playSwitch } from '../fx/audio.js';

const $ = (id) => document.getElementById(id);
const home = $('menu-home'), panel = $('menu-shop'), list = $('shop-list');

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const COIN = '<i class="coin"></i>';

// A price button. label: what it says (it may include gold(), so it is set as HTML: only ever our own text); price: gold it costs (null = nothing to buy, so it's just a tag).
function button(label, price, onClick, on = false) {
  const b = el('button', `buy${on ? ' on' : ''}`);
  b.innerHTML = label;
  b.type = 'button';
  if (price !== null && profile.gold < price) b.disabled = true;   // can't afford it
  if (onClick) b.addEventListener('click', () => { if (onClick() !== false) refresh(); });
  else b.disabled = true;
  return b;
}
const gold = (n) => `${COIN}${n.toLocaleString()}`;   // an amount of gold: a coin and the number

function row(name, detail, ...controls) {
  const r = el('div', 'shop-row'), text = el('div', 'shop-text');
  text.append(el('div', 'shop-name', name), el('div', 'shop-detail', detail));
  const side = el('div', 'shop-side');
  side.append(...controls);
  r.append(text, side);
  return r;
}

function pips(have, max) {
  const p = el('div', 'pips');
  for (let i = 0; i < max; i++) p.append(el('i', i < have ? 'on' : ''));
  return p;
}

const bought = (did) => { if (did) playChest(); return did; };

const TABS = ['Upgrades', 'Guns', 'Style'];
let tab = TABS[0], onLook = null;   // onLook: called when what Kirky is wearing changes

// A row for one cosmetic slot: its name, then a button for each option.
// Owned options put it on; the others show their price and buy it.
function styleRow(slot) {
  const r = el('div', 'shop-row style'), options = el('div', 'shop-options');
  for (const option of slot.options) {
    const have = owns(slot, option), on = wearing(slot) === option;
    const swatch = option.color ? `<i class="swatch" style="background:${option.color}"></i>` : '';
    const mine = have && button(`${swatch}${option.name}`, null, () => { wear(slot, option); playSwitch(); }, on);
    if (mine) mine.classList.add('owned');
    options.append(have
      ? mine
      : option.casino ? button(`${swatch}${option.name} \u00b7 slots prize`, null)   // (can't be bought: see the casino)
      : button(`${swatch}${option.name} ${gold(slot.price)}`, slot.price, () => bought(buy(slot, option))));
  }
  r.append(el('div', 'shop-name', slot.name), options);
  return r;
}

export function refresh() {
  $('shop-gold').innerHTML = gold(profile.gold);
  $('menu-gold').innerHTML = gold(profile.gold);
  $('shop-tabs').replaceChildren(...TABS.map((name) => {
    const b = el('button', `chip${name === tab ? ' on' : ''}`, name);
    b.type = 'button';
    b.addEventListener('click', () => { tab = name; refresh(); });
    return b;
  }));
  const rows = [];
  if (tab === 'Style') {
    rows.push(el('div', 'shop-note', 'How Kirky looks. None of it changes how he plays.'));
    for (const slot of SLOTS) rows.push(styleRow(slot));
    rows.push(el('div', 'menu-label', 'Gold guns'));
    for (const g of GOLD_GUNS) {
      rows.push(row(g.name, 'A solid gold finish.', ownsGold(g.id)
        ? button(goldOn(g.id) ? 'Gold: on' : 'Gold: off', null, () => { toggleGold(g.id); playSwitch(); }, goldOn(g.id))
        : button(gold(GOLD_SKIN_PRICE), GOLD_SKIN_PRICE, () => bought(buyGold(g.id)))));
    }
  }
  if (tab === 'Upgrades') {
    rows.push(el('div', 'menu-label', 'Permanent upgrades'));
    for (const u of PERMANENT) {
      const have = level(u.id), price = nextPrice(u);
      rows.push(row(u.name, `${u.per} per level`, pips(have, u.max),
        price === null ? button('Max', null) : button(gold(price), price, () => bought(buyUpgrade(u)))));
    }
    rows.push(el('div', 'menu-label', 'Unlocks'));
    for (const u of UNLOCKS) {
      rows.push(row(u.name, u.description, hasUnlock(u.id) ? button('Owned', null) : button(gold(u.price), u.price, () => bought(buyUnlock(u)))));
    }
  }
  if (tab === 'Guns') {
    rows.push(el('div', 'shop-note', 'Unlock a gun and it can turn up in chests. Pay again to start runs holding it (one starting gun at a time).'));
    for (const g of GUNS) {
      const open = gunUnlocked(g.id), canStart = profile.starts.includes(g.id), starting = profile.startGun === g.id;
      rows.push(row(g.name, g.description,
        open ? button(g.unlock ? 'Unlocked' : 'In chests', null) : button(`Unlock ${gold(g.unlock)}`, g.unlock, () => bought(buyGun(g))),
        !open ? button(`Start ${gold(g.start)}`, null)
          : canStart ? button(starting ? 'Starting gun' : 'Start with it', null, () => { chooseStart(g.id); playSwitch(); }, starting)
            : button(`Start ${gold(g.start)}`, g.start, () => bought(buyStart(g)))));
    }
  }
  list.replaceChildren(...rows);
  onLook?.();
}

$('menu-shop-open').addEventListener('click', () => { home.classList.add('hidden'); panel.classList.remove('hidden'); refresh(); });
$('shop-back').addEventListener('click', () => { panel.classList.add('hidden'); home.classList.remove('hidden'); });

export const shop = {
  refresh,
  // Call `fn` whenever what Kirky is wearing may have changed.
  onLook(fn) { onLook = fn; },
  // Back to the closed state (the menu is being shown afresh).
  close() { panel.classList.add('hidden'); refresh(); },
};
