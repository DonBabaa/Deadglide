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

// Moon dust: grey, grainy, blotched, and pocked with little craters (a dark hollow with a bright far edge).
export function regolithTexture() {
  return canvas(1024, (g, s) => {
    g.fillStyle = '#b9b8ba';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 90, 0.09);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 2 + Math.random() * Math.random() * 26;
      for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {   // (wrapped copies: it tiles)
        g.fillStyle = 'rgba(40, 40, 46, 0.22)';
        g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(245, 245, 250, 0.28)'; g.lineWidth = Math.max(1, r * 0.16);
        g.beginPath(); g.arc(x + ox, y + oy, r, -0.5, 1.9); g.stroke();
        g.strokeStyle = 'rgba(20, 20, 26, 0.3)';
        g.beginPath(); g.arc(x + ox, y + oy, r * 0.92, 2.6, 5); g.stroke();
      }
    }
    for (let i = 0; i < 1400; i++) {   // stones
      g.fillStyle = Math.random() < 0.5 ? 'rgba(30, 30, 34, 0.35)' : 'rgba(235, 235, 240, 0.3)';
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2.5, 1 + Math.random() * 2);
    }
    grain(g, s, 46);
  });
}

// Bare rock, in layers: the crater wall.
export function strataTexture() {
  return canvas(512, (g, s) => {
    g.fillStyle = '#8a898c';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s;) {
      const h = 6 + Math.random() * 40, shade = 95 + Math.random() * 80;
      g.fillStyle = `rgb(${shade}, ${shade}, ${shade + 4})`;
      g.fillRect(0, y, s, h);
      g.fillStyle = 'rgba(20, 20, 24, 0.5)';
      g.fillRect(0, y + h - 1.5, s, 1.5);
      y += h;
    }
    g.strokeStyle = 'rgba(15, 15, 18, 0.5)';   // cracks running down it
    for (let i = 0; i < 26; i++) {
      let x = Math.random() * s, y = Math.random() * s;
      g.lineWidth = 0.6 + Math.random() * 1.6;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 9; k++) { x += (Math.random() - 0.5) * 22; y += Math.random() * 30; g.lineTo(x, y); }
      g.stroke();
    }
    blotches(g, s, 30, 0.08);
    grain(g, s, 30);
  });
}

// Plating: the Moon base's ramps and decks. Panels with seams and rivets, scuffed.
export function plateTexture() {
  return canvas(512, (g, s) => {
    g.fillStyle = '#c4c6cc';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 18, 0.06);
    const N = 4, cell = s / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      g.strokeStyle = 'rgba(30, 32, 40, 0.6)'; g.lineWidth = 3;
      g.strokeRect(i * cell + 1.5, j * cell + 1.5, cell - 3, cell - 3);
      g.strokeStyle = 'rgba(255, 255, 255, 0.35)'; g.lineWidth = 1;
      g.strokeRect(i * cell + 5, j * cell + 5, cell - 10, cell - 10);
      g.fillStyle = 'rgba(40, 42, 50, 0.7)';
      for (const [x, y] of [[12, 12], [cell - 12, 12], [12, cell - 12], [cell - 12, cell - 12]]) { g.beginPath(); g.arc(i * cell + x, j * cell + y, 3, 0, Math.PI * 2); g.fill(); }
    }
    g.strokeStyle = 'rgba(60, 60, 66, 0.25)';   // scuffs
    for (let i = 0; i < 60; i++) { const x = Math.random() * s, y = Math.random() * s; g.lineWidth = 1 + Math.random(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 70, y + (Math.random() - 0.5) * 20); g.stroke(); }
    grain(g, s, 16);
  });
}

// Lava: a dark crust broken by bright cracks.
export function lavaTexture() {
  return canvas(512, (g, s) => {
    g.fillStyle = '#ff8a1c';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {   // plates of cooling crust, with the glow showing between them
      const x = Math.random() * s, y = Math.random() * s, r = 22 + Math.random() * 46;
      for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
        const fade = g.createRadialGradient(x + ox, y + oy, r * 0.2, x + ox, y + oy, r);
        fade.addColorStop(0, 'rgba(46, 10, 4, 0.96)'); fade.addColorStop(0.75, 'rgba(120, 22, 6, 0.9)'); fade.addColorStop(1, 'rgba(255, 120, 20, 0)');
        g.fillStyle = fade;
        g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = 'rgba(255, 240, 150, 0.9)';   // the hottest spots
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 0, Math.PI * 2); g.fill(); }
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
