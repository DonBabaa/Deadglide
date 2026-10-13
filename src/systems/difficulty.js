// How hard a run is. Three tiers, picked on the menu for each level and remembered there (profile.tiers):
//   Mastre   for getting through the story: hits take less off you, they have less health, there are fewer of them
//   Normal   the game as it was made
//   Chad     for when that is too easy: all of it the other way, and your score is worth more
// Each tier is a handful of plain multipliers (config.difficulty). Whatever one of them applies to reads it from
// `difficulty`, which is set when a run is started from the menu (setTier) and stays as it is for the whole of that
// run: through every level of the story from there, and every try at it.
import { config } from '../config.js';
import { profile, saveProfile } from './profile.js';

export const TIERS = ['mastre', 'normal', 'chad'];
export const difficulty = { tier: 'normal', ...config.difficulty.normal };

export function setTier(id) {
  const tier = TIERS.includes(id) ? id : 'normal';
  Object.assign(difficulty, config.difficulty[tier], { tier });
}

// The tier a level was last played on (Normal, until one is picked).
export const tierOf = (level) => (TIERS.includes(profile.tiers[level]) ? profile.tiers[level] : 'normal');
export function chooseTier(level, id) {
  if (!TIERS.includes(id)) return;
  profile.tiers[level] = id;
  saveProfile();
}

// What a tier does on a level, in a line (for the menu). L: the level (LEVELS[n] in world/level.js).
export function describeTier(id, L = {}) {
  const D = config.difficulty[id];
  if (!D || id === 'normal') return 'The game as it was made.';
  const by = (k) => `${Math.abs(Math.round((k - 1) * 100))}%`, parts = [];
  if (D.damage !== 1) parts.push(`hits take ${by(D.damage)} ${D.damage < 1 ? 'less' : 'more'} off you`);
  if (!L.descent && !L.finale && D.health !== 1) parts.push(`monsters have ${by(D.health)} ${D.health < 1 ? 'less' : 'more'} health`);
  if (!L.descent && D.boss !== 1) parts.push(`${L.finale ? 'Babitus has' : 'bosses have'} ${by(D.boss)} ${D.boss < 1 ? 'less' : 'more'} health`);
  if (!L.descent && !L.finale && D.crowd !== 1) parts.push(`${by(D.crowd)} ${D.crowd < 1 ? 'fewer' : 'more'} of them at once`);
  if (L.descent && D.collapse !== 1) parts.push(`the hill comes down ${by(D.collapse)} ${D.collapse < 1 ? 'slower' : 'faster'}`);
  if (!L.descent && D.score !== 1) parts.push(`your score is worth ${by(D.score)} ${D.score < 1 ? 'less' : 'more'}`);
  const line = parts.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}
