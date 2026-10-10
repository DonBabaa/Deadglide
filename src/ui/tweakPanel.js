// Live tweak panel (lil-gui), toggled with `. Builds itself from config.js:
// add a number or boolean there and it shows up here.
import GUI from 'lil-gui';
import { config, defaults } from '../config.js';

export function createTweakPanel({ onRespawn }) {
  const gui = new GUI({ title: 'Tuning  ( ` to hide )', width: 330 });

  for (const [group, values] of Object.entries(config)) {
    const folder = gui.addFolder(group);
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'boolean') folder.add(values, key);
      else if (typeof value === 'number') folder.add(values, key, 0, value === 0 ? 5 : value * 3);
    }
    if (group !== 'skate') folder.close();
  }

  const actions = {
    respawn: onRespawn,
    'reset to defaults': () => {
      for (const group of Object.keys(config)) Object.assign(config[group], defaults[group]);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    },
    'copy config (JSON)': () => {
      const json = JSON.stringify(config, null, 2);
      console.log(json);
      navigator.clipboard?.writeText(json);
    },
  };
  for (const name of Object.keys(actions)) gui.add(actions, name);

  gui.hide();
  return {
    get open() { return !gui._hidden; },
    toggle() { gui.show(gui._hidden); },
  };
}
