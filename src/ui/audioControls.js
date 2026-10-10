// Music on/off button and volume slider on the pause menu.
// The choice is remembered between visits.
import { config } from '../config.js';
import { audio, applyVolume, toggleMusic } from '../fx/audio.js';

const box = document.getElementById('audio-controls');
const button = document.getElementById('music-toggle');
const slider = document.getElementById('music-volume');
const KEY = 'deadglide.audio';

// Restore last time's settings.
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved) {
    config.audio.musicVolume = Math.min(1, Math.max(0, Number(saved.volume) || 0));
    audio.muted = !!saved.muted;
  }
} catch {}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ volume: config.audio.musicVolume, muted: audio.muted })); } catch {}
}

// Make the controls show the current state (call after changing it elsewhere, e.g. the M key).
export function syncAudioControls() {
  button.textContent = audio.muted ? 'Music: off' : 'Music: on';
  button.classList.toggle('off', audio.muted);
  slider.value = Math.round(config.audio.musicVolume * 100);
  slider.disabled = audio.muted;
  save();
}

// Clicking the controls must not count as "click to resume".
box.addEventListener('click', (e) => e.stopPropagation());

button.addEventListener('click', () => {
  toggleMusic();
  syncAudioControls();
  button.blur();   // so Space doesn't press it again while skating
});
slider.addEventListener('input', () => {
  config.audio.musicVolume = slider.value / 100;
  applyVolume();
  save();
});
slider.addEventListener('change', () => slider.blur());   // give the keyboard back to the game

syncAudioControls();
