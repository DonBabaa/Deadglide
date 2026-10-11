// Kirky's clothes, painted onto canvases at startup (no image files).
import * as THREE from 'three';

function paint(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function grain(g, size, amount) {
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Brushed cotton fleece: soft speckle with a faint knit.
export function hoodieTexture(color = '#7a2f2b') {
  return paint(128, (g, s) => {
    g.fillStyle = color;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.10)';
    for (let x = 0; x < s; x += 3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
    grain(g, s, 26);
  }, 3, 3);
}

// Denim: diagonal twill, worn patches, and an orange stitched seam.
export function denimTexture() {
  return paint(128, (g, s) => {
    g.fillStyle = '#31466a';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(190,205,235,0.16)';
    g.lineWidth = 1;
    for (let k = -s; k < s * 2; k += 4) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k - s, s); g.stroke(); }
    const fade = g.createLinearGradient(0, 0, s, 0);   // lighter down the front of the leg
    fade.addColorStop(0.3, 'rgba(160,185,225,0)');
    fade.addColorStop(0.5, 'rgba(160,185,225,0.22)');
    fade.addColorStop(0.7, 'rgba(160,185,225,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#c98a3a';                          // side seam stitching
    g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(8, 0); g.lineTo(8, s); g.stroke();
    g.setLineDash([]);
    grain(g, s, 22);
  }, 2, 2);
}

// Ribbed knit for the beanie and the hoodie's cuffs and hem.
export function ribTexture(color) {
  return paint(64, (g, s) => {
    g.fillStyle = color;
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.32)';
      g.fillRect(x, 0, 3, s);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(x + 4, 0, 2, s);
    }
    grain(g, s, 14);
  }, 6, 1);
}

// Black canvas for the shoes.
export function canvasTexture() {
  return paint(64, (g, s) => {
    g.fillStyle = '#16171a';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let k = 0; k < s; k += 2) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, s); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(s, k); g.stroke(); }
    grain(g, s, 10);
  }, 2, 2);
}

// Graphics for the underside of the deck (a cosmetic). The image runs nose to tail.
export function deckTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d'), w = c.width, h = c.height;
  g.fillStyle = '#141416';
  g.fillRect(0, 0, w, h);
  if (kind === 'checker') {
    g.fillStyle = '#ece8dc';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 32, y * 32, 32, 32);
  } else if (kind === 'flames') {
    // Tongues of flame licking up from the tail: red, then orange, then yellow inside.
    for (const [color, height, width] of [['#c8201b', 215, 30], ['#ff7a1a', 165, 22], ['#ffd23a', 110, 14]]) {
      g.fillStyle = color;
      for (let i = 0; i < 5; i++) {
        const x = 13 + i * 25.5, top = h - height * (0.7 + 0.3 * Math.sin(i * 2.1 + height));
        g.beginPath();
        g.moveTo(x - width, h);
        g.bezierCurveTo(x - width, h - 70, x + width * 0.9, top + 70, x + (i % 2 ? 7 : -7), top);
        g.bezierCurveTo(x + width * 0.3, top + 50, x + width, h - 70, x + width, h);
        g.fill();
      }
    }
  } else if (kind === 'skull') {
    g.fillStyle = '#e6e0cf';
    g.beginPath(); g.ellipse(64, 108, 46, 50, 0, 0, Math.PI * 2); g.fill();   // the dome
    g.fillRect(36, 138, 56, 42);                                             // the jaw
    g.fillStyle = '#141416';
    g.beginPath(); g.ellipse(45, 112, 13, 15, 0, 0, Math.PI * 2); g.fill();   // eye sockets
    g.beginPath(); g.ellipse(83, 112, 13, 15, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(64, 128); g.lineTo(57, 146); g.lineTo(71, 146); g.fill();   // nose
    for (let x = 44; x < 92; x += 10) g.fillRect(x, 158, 2, 22);                       // teeth
    g.fillStyle = '#c8201b';
    g.fillRect(0, 22, w, 7); g.fillRect(0, h - 29, w, 7);                              // a stripe at each end
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The skull stencilled on the back of Kirky's hoodie (see-through round it).
export function emblemTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e3d2';
  g.beginPath(); g.ellipse(64, 54, 40, 42, 0, 0, Math.PI * 2); g.fill();   // the dome
  g.fillRect(40, 78, 48, 34);                                             // the jaw
  g.globalCompositeOperation = 'destination-out';                         // cut the holes out
  g.beginPath(); g.ellipse(47, 58, 12, 14, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(81, 58, 12, 14, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(64, 72); g.lineTo(57, 88); g.lineTo(71, 88); g.fill();
  for (let x = 48; x < 88; x += 10) g.fillRect(x, 96, 3, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
