// Settings on the pause menu: music and sound effects (on/off and volume),
// and mouse sensitivity. The choices are remembered between visits.
import { config } from '../config.js';
import { audio, applyVolume, toggleMusic, playShot } from '../fx/audio.js';

const $ = (id) => document.getElementById(id);
const box = $('audio-controls');
const musicButton = $('music-toggle'), musicSlider = $('music-volume');
const sfxButton = $('sfx-toggle'), sfxSlider = $('sfx-volume');
const sensSlider = $('sens'), sensValue = $('sens-value');
const KEY = 'deadglide.audio';
const BASE_SENSITIVITY = config.camera.mouseSensitivity;   // the slider is a percentage of this
const unit = (n, fallback) => (Number.isFinite(Number(n)) ? Math.min(1, Math.max(0, Number(n))) : fallback);

// Restore last time's settings.
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved) {
    config.audio.musicVolume = unit(saved.volume, config.audio.musicVolume);
    audio.muted = !!saved.muted;
    config.audio.sfxVolume = unit(saved.sfxVolume, config.audio.sfxVolume);
    audio.sfxMuted = !!saved.sfxMuted;
    if (saved.sensitivity > 0) config.camera.mouseSensitivity = BASE_SENSITIVITY * Math.min(3, Math.max(0.2, saved.sensitivity));
  }
} catch {}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      volume: config.audio.musicVolume, muted: audio.muted,
      sfxVolume: config.audio.sfxVolume, sfxMuted: audio.sfxMuted,
      sensitivity: config.camera.mouseSensitivity / BASE_SENSITIVITY,
    }));
  } catch {}
}

// Make the controls show the current state (call after changing it elsewhere, e.g. the M key).
export function syncAudioControls() {
  musicButton.textContent = audio.muted ? 'Music: off' : 'Music: on';
  musicButton.classList.toggle('off', audio.muted);
  musicSlider.value = Math.round(config.audio.musicVolume * 100);
  musicSlider.disabled = audio.muted;
  sfxButton.textContent = audio.sfxMuted ? 'Sound FX: off' : 'Sound FX: on';
  sfxButton.classList.toggle('off', audio.sfxMuted);
  sfxSlider.value = Math.round(config.audio.sfxVolume * 100);
  sfxSlider.disabled = audio.sfxMuted;
  const percent = Math.round((config.camera.mouseSensitivity / BASE_SENSITIVITY) * 100);
  sensSlider.value = percent;
  sensValue.textContent = `${percent}%`;
  save();
}

// Clicking the controls must not count as "click to resume".
box.addEventListener('click', (e) => e.stopPropagation());

musicButton.addEventListener('click', () => {
  toggleMusic();
  syncAudioControls();
  musicButton.blur();   // so Space doesn't press it again while skating
});
musicSlider.addEventListener('input', () => {
  config.audio.musicVolume = musicSlider.value / 100;
  applyVolume();
  save();
});

sfxButton.addEventListener('click', () => {
  audio.sfxMuted = !audio.sfxMuted;
  applyVolume();
  syncAudioControls();
  sfxButton.blur();
});
sfxSlider.addEventListener('input', () => {
  config.audio.sfxVolume = sfxSlider.value / 100;
  applyVolume();
  save();
});
sfxSlider.addEventListener('change', () => playShot('pistol'));   // let them hear how loud that is

sensSlider.addEventListener('input', () => {
  config.camera.mouseSensitivity = BASE_SENSITIVITY * (sensSlider.value / 100);
  sensValue.textContent = `${sensSlider.value}%`;
  save();
});

// Give the keyboard back to the game after dragging a slider.
for (const slider of [musicSlider, sfxSlider, sensSlider]) slider.addEventListener('change', () => slider.blur());

syncAudioControls();
