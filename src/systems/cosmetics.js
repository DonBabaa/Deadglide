// Cosmetics: how Kirky looks. Bought with gold in the shop, no effect on play.
// What you own and what you're wearing is saved with the rest of your profile.
//
// SLOTS lists everything on sale. (`ending: true`: not for sale either: it is what you get for finishing the game.)
// Each slot has options; the first is the free
// default. Options marked `casino: true` can't be bought: they are prizes from
// the casino's slot machines (see casino/slots.js). To add one, add it here and make SkaterModel.applyLook() (or, for
// tracers, main.js) understand its value.
import { profile, pay, saveProfile } from './profile.js';
import { WEAPONS } from '../player/weapons.js';
import { COSTUMES } from '../player/costumes.js';

export const SLOTS = [
  { id: 'hoodie', name: 'Hoodie', price: 150, options: [
    { id: 'red', name: 'Blood red', color: '#7a2f2b' },
    { id: 'black', name: 'Black', color: '#1f2024' },
    { id: 'green', name: 'Forest', color: '#2f5a3a' },
    { id: 'bone', name: 'Bone', color: '#d6cfbd' },
    { id: 'purple', name: 'Purple', color: '#55307a' },
    { id: 'midnight', name: 'Midnight blue', color: '#1d2b55' },
    { id: 'toxic', name: 'Toxic green', color: '#6fae1f' },
    { id: 'orange', name: 'Hazard orange', color: '#c9591c' },
    { id: 'pink', name: 'Bubblegum', color: '#c9487e' },
    { id: 'lame', name: 'Gold lam\u00e9', color: '#c9a23a', casino: true },
    { id: 'velvet', name: 'High-roller velvet', color: '#6a0f2c', casino: true },
  ] },
  { id: 'beanie', name: 'Beanie', price: 100, options: [
    { id: 'charcoal', name: 'Charcoal', color: '#24262c' },
    { id: 'red', name: 'Red', color: '#8a2a26' },
    { id: 'mustard', name: 'Mustard', color: '#c79a2a' },
    { id: 'green', name: 'Green', color: '#2e5d43' },
    { id: 'blue', name: 'Blue', color: '#2f4f8a' },
    { id: 'white', name: 'Bone white', color: '#d8d2bf' },
    { id: 'purple', name: 'Purple', color: '#5a2f86' },
    { id: 'orange', name: 'Orange', color: '#c9591c' },
    { id: 'none', name: 'No beanie' },
    { id: 'gold', name: 'Gold', color: '#d9b24a', casino: true },
  ] },
  { id: 'deck', name: 'Deck graphic', price: 200, options: [
    { id: 'wood', name: 'Plain wood' },
    { id: 'flames', name: 'Flames' },
    { id: 'skull', name: 'Skull' },
    { id: 'checker', name: 'Checker' },
    { id: 'web', name: 'Spider web' },
    { id: 'bones', name: 'Crossbones' },
    { id: 'toxic', name: 'Toxic slime' },
    { id: 'stripes', name: 'Hazard stripes' },
    { id: 'cards', name: 'Four aces', casino: true },
    { id: 'sevens', name: 'Lucky sevens', casino: true },
  ] },
  { id: 'wheels', name: 'Wheels', price: 75, options: [
    { id: 'bone', name: 'Bone', color: '#e9e4d4' },
    { id: 'red', name: 'Red', color: '#c8201b' },
    { id: 'green', name: 'Green', color: '#3fbf6a' },
    { id: 'blue', name: 'Blue', color: '#3f7fd6' },
    { id: 'black', name: 'Black', color: '#18181b' },
    { id: 'purple', name: 'Purple', color: '#8a4fd0' },
    { id: 'orange', name: 'Orange', color: '#e8791f' },
    { id: 'toxic', name: 'Toxic', color: '#8dff5a' },
    { id: 'gold', name: 'Gold', color: '#d9b24a', casino: true },
  ] },
  { id: 'tracer', name: 'Bullet tracer', price: 250, options: [
    { id: 'amber', name: 'Amber', color: '#ffd9a0' },
    { id: 'green', name: 'Green', color: '#7dffb0' },
    { id: 'blue', name: 'Blue', color: '#7fc8ff' },
    { id: 'purple', name: 'Purple', color: '#d0a6ff' },
    { id: 'red', name: 'Blood red', color: '#ff5a4a' },
    { id: 'pink', name: 'Hot pink', color: '#ff7ac8' },
    { id: 'white', name: 'Bone white', color: '#f4f0e4' },
    { id: 'jackpot', name: 'Jackpot gold', color: '#ffd23a', casino: true },
  ] },
  { id: 'smoke', name: 'In his mouth', price: 150, options: [
    { id: 'cigarette', name: 'Boof' },
    { id: 'lollipop', name: 'Lollipop' },
    { id: 'toothpick', name: 'Toothpick' },
    { id: 'pipe', name: 'Pipe' },
    { id: 'rose', name: 'Rose' },
    { id: 'bone', name: 'Finger bone' },
    { id: 'nothing', name: 'Nothing' },
    { id: 'cigar', name: 'Cigar', casino: true },
    { id: 'goldbroken', name: 'The Golden BOOF', ending: true },   // (the prize for finishing the game)
  ] },
  // Costumes (player/costumes.js). They can't be bought: each is found on the Moon, in Free Ride, and shows
  // as "???" until you have. Each comes in two pieces, the body and the head, to wear together or apart.
  { id: 'outfit', name: 'Costume: body', price: 0, options: [{ id: 'none', name: 'None' }, ...Object.entries(COSTUMES).map(([id, c]) => ({ id, name: c.name, secret: true }))] },
  { id: 'mask', name: 'Costume: head', price: 0, options: [{ id: 'none', name: 'None' }, ...Object.entries(COSTUMES).map(([id, c]) => ({ id, name: c.name, secret: true }))] },
];
export const slot = (id) => SLOTS.find((s) => s.id === id);

// A gold finish for each gun.
export const GOLD_SKIN_PRICE = 1000;
export const GOLD_GUNS = Object.values(WEAPONS).map((w) => ({ id: w.id, name: w.name }));

const C = profile.cosmetics;
const key = (slot, option) => `${slot.id}:${option.id}`;

export const owns = (slot, option) => option === slot.options[0] || C.owned.includes(key(slot, option));
// The option being worn in a slot (the default if nothing else is chosen).
export const wearing = (slot) => slot.options.find((o) => o.id === C.look[slot.id] && owns(slot, o)) || slot.options[0];

export function wear(slot, option) {
  if (!owns(slot, option)) return;
  C.look[slot.id] = option.id;
  saveProfile();
}
// Buying something puts it on.
export const buy = (slot, option) => !owns(slot, option) && pay(slot.price, () => { C.owned.push(key(slot, option)); C.look[slot.id] = option.id; });

// Casino prizes you haven't won yet: [slot, option] pairs.
export const casinoPrizes = () => SLOTS.flatMap((slot) => slot.options.filter((o) => o.casino && !owns(slot, o)).map((o) => [slot, o]));
// Win one: it's yours, and he puts it straight on.
export function award(slot, option) {
  if (owns(slot, option)) return;
  C.owned.push(key(slot, option));
  C.look[slot.id] = option.id;
  saveProfile();
}

export const ownsGold = (gunId) => C.gold.includes(gunId);
export const goldOn = (gunId) => ownsGold(gunId) && !C.goldOff.includes(gunId);
export const buyGold = (gunId) => !ownsGold(gunId) && pay(GOLD_SKIN_PRICE, () => { C.gold.push(gunId); });
export function toggleGold(gunId) {
  if (!ownsGold(gunId)) return;
  C.goldOff = goldOn(gunId) ? [...C.goldOff, gunId] : C.goldOff.filter((id) => id !== gunId);
  saveProfile();
}

// Everything the models need to know, in one object.
export function currentLook() {
  const look = { goldGuns: new Set(GOLD_GUNS.map((g) => g.id).filter(goldOn)) };
  for (const slot of SLOTS) {
    const option = wearing(slot);
    look[slot.id] = option.color || option.id;   // a colour where there is one, otherwise the option's name
  }
  return look;
}
