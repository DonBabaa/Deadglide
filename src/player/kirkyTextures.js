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
export function hoodieTexture() {
  return paint(128, (g, s) => {
    g.fillStyle = '#7a2f2b';
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
