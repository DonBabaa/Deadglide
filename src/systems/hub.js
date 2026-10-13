// The Mastre Gaming hub: a launcher that serves this game, among others, out of a folder of its own site, in a frame
// on its page (what it knows of the game is in mastre.json, at the top of the repo). Two things are said to the page
// the game is framed in: that it has loaded, and that the player wants out. On its own the game is in nobody's
// frame, and says neither.
export const framed = window.parent !== window;
const tell = (type) => { if (framed) try { window.parent.postMessage({ type }, '*'); } catch {} };
export const hubReady = () => tell('mastre:ready');
export const hubExit = () => tell('mastre:exit');
