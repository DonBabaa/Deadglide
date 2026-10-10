// Procedural textures painted onto canvases at startup (no image files).
import * as THREE from 'three';

function canvas(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Per-pixel grain on top of whatever is already painted.
function grain(g, size, amount) {
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// Soft light/dark stains.
function blotches(g, size, count, alpha) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = size * (0.05 + Math.random() * 0.2);
    const shade = Math.random() < 0.6 ? 0 : 255;
    // Draw wrapped copies so the texture tiles without seams.
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grad.addColorStop(0, `rgba(${shade},${shade},${shade},${alpha})`);
      grad.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
      g.fillStyle = grad;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}

// Poured concrete slab: one texture tile = one slab, with a joint around it.
export function concreteTexture() {
  return canvas(512, (g, s) => {
    g.fillStyle = '#8d8c87';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 26, 0.06);
    // hairline cracks
    g.strokeStyle = 'rgba(40,40,38,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      let x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += (Math.random() - 0.5) * 50; y += Math.random() * 30; g.lineTo(x, y); }
      g.stroke();
    }
    grain(g, s, 22);
    // expansion joint
    g.strokeStyle = 'rgba(30,30,28,0.75)';
    g.lineWidth = 4;
    g.strokeRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 2;
    g.strokeRect(4, 4, s - 8, s - 8);
  });
}

// Neutral ground detail. The ground mesh tints it grey (concrete) or green
// (grass) per vertex, so one texture serves the whole world.
export function groundTexture() {
  return canvas(512, (g, s) => {
    g.fillStyle = '#c9c9c9';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 40, 0.07);
    g.strokeStyle = 'rgba(40,40,40,0.25)';
    g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      let x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 10; k++) { x += (Math.random() - 0.5) * 50; y += Math.random() * 30; g.lineTo(x, y); }
      g.stroke();
    }
    grain(g, s, 34);
  });
}

// Smooth ramp concrete: no joints.
export function rampTexture() {
  return canvas(256, (g, s) => {
    g.fillStyle = '#9a9994';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 14, 0.05);
    grain(g, s, 18);
  });
}

// Stone block wall.
export function stoneWallTexture() {
  return canvas(512, (g, s) => {
    g.fillStyle = '#3d3c3a';
    g.fillRect(0, 0, s, s);
    const rows = 8, h = s / rows;
    for (let r = 0; r < rows; r++) {
      const cols = 4, w = s / cols, off = r % 2 ? w / 2 : 0;
      for (let c = -1; c <= cols; c++) {
        const v = 95 + Math.random() * 45;
        g.fillStyle = `rgb(${v},${v * 0.98},${v * 0.94})`;
        g.fillRect(c * w + off + 3, r * h + 3, w - 6, h - 6);
      }
    }
    blotches(g, s, 30, 0.1);
    // moss creeping up from the bottom of each tile
    const moss = g.createLinearGradient(0, s * 0.55, 0, s);
    moss.addColorStop(0, 'rgba(50,70,40,0)');
    moss.addColorStop(1, 'rgba(50,70,40,0.35)');
    g.fillStyle = moss;
    g.fillRect(0, 0, s, s);
    grain(g, s, 26);
  });
}

// Plain weathered stone for headstones and crypts.
export function stoneTexture() {
  return canvas(256, (g, s) => {
    g.fillStyle = '#8b8a84';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 30, 0.12);
    grain(g, s, 30);
  });
}

export function grassTexture() {
  return canvas(512, (g, s) => {
    g.fillStyle = '#2c3a22';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 40, 0.12);
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * s, y = Math.random() * s, v = 40 + Math.random() * 50;
      g.strokeStyle = `rgba(${v * 0.75},${v},${v * 0.5},0.5)`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 5); g.stroke();
    }
    grain(g, s, 16);
  });
}

// Soft round glow (moon halo, lamp flares).
export function glowTexture() {
  const tex = canvas(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
