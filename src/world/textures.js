// Procedural textures painted onto canvases at startup (no image files).
import * as THREE from 'three';

function canvas(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
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

// The bumps of a surface, read off its picture (what is dark in it is taken to be deep: a crack, a joint, a pit), as
// a normal map the light can catch on. strength: how deep. It tiles as the picture does.
export function relief(tex, strength = 2) {
  const src = tex.image, s = src.width, h = src.height;
  const from = src.getContext('2d').getImageData(0, 0, s, h).data, lum = new Float32Array(s * h);
  for (let i = 0; i < s * h; i++) lum[i] = (from[i * 4] * 0.3 + from[i * 4 + 1] * 0.59 + from[i * 4 + 2] * 0.11) / 255;
  const c = document.createElement('canvas');
  c.width = s; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(s, h), d = img.data;
  const at = (x, y) => lum[((y + h) % h) * s + ((x + s) % s)];
  for (let y = 0; y < h; y++) for (let x = 0; x < s; x++) {
    // (a wide and a narrow difference together: the shape of the thing, and its grain)
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.6 + (at(x + 3, y) - at(x - 3, y)) * 0.4, dy = (at(x, y + 1) - at(x, y - 1)) * 0.6 + (at(x, y + 3) - at(x, y - 3)) * 0.4;
    const nx = -dx * strength, ny = dy * strength, k = 1 / Math.hypot(nx, ny, 1), i = (y * s + x) * 4;
    d[i] = (nx * k * 0.5 + 0.5) * 255; d[i + 1] = (ny * k * 0.5 + 0.5) * 255; d[i + 2] = (k * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.wrapS = out.wrapT = THREE.RepeatWrapping;
  out.repeat.copy(tex.repeat);
  out.anisotropy = 16;
  return out;
}

// A crack: a dark line that wanders, forks, and thins out. Drawn wrapped, so the picture still tiles.
function crack(g, size, x, y, angle, length, width, depth = 0) {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    let px = x + ox, py = y + oy, a = angle;
    const seed = Math.sin(x * 12.9898 + y * 78.233 + depth) * 43758.5453;
    let r = seed - Math.floor(seed);
    const rnd = () => (r = (r * 16807 + 0.1) % 1);
    g.beginPath(); g.moveTo(px, py);
    const steps = Math.ceil(length / 7);
    for (let k = 0; k < steps; k++) { a += (rnd() - 0.5) * 1.1; px += Math.cos(a) * 7; py += Math.sin(a) * 7; g.lineTo(px, py); }
    g.lineWidth = width; g.stroke();
  }
  if (depth < 2 && length > 40) for (let k = 0; k < 2; k++) crack(g, size, x + Math.cos(angle) * length * (0.3 + 0.3 * k), y + Math.sin(angle) * length * (0.3 + 0.3 * k), angle + (k ? 1 : -1) * (0.6 + Math.random() * 0.6), length * 0.5, width * 0.6, depth + 1 + k * 0.1);
}

// Pits, pebbles and flecks: small round marks, dark with a light lip (so they read as hollows) or the other way (as bumps).
function specks(g, size, count, rMin, rMax, hollow = true) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = rMin + Math.random() * (rMax - rMin);
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (x + ox < -r || x + ox > size + r || y + oy < -r || y + oy > size + r) continue;
      g.fillStyle = hollow ? 'rgba(20,20,20,0.5)' : 'rgba(235,235,230,0.45)';
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, 7); g.fill();
      g.fillStyle = hollow ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.3)';
      g.beginPath(); g.arc(x + ox + r * 0.35, y + oy + r * 0.35, r * 0.7, 0, 7); g.fill();
    }
  }
}

// Neutral ground detail. The ground mesh tints it grey (concrete) or green
// (grass) per vertex, so one texture serves the whole world. Old, cracked, pitted and stained.
export function groundTexture() {
  return canvas(1024, (g, s) => {
    g.fillStyle = '#c4c4c2';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 70, 0.08);
    specks(g, s, 900, 0.6, 2.2, true);
    specks(g, s, 260, 1, 3.2, false);
    g.strokeStyle = 'rgba(25,25,25,0.5)';
    for (let i = 0; i < 5; i++) crack(g, s, Math.random() * s, Math.random() * s, Math.random() * 6.28, 160 + Math.random() * 220, 1.5);
    g.strokeStyle = 'rgba(40,40,40,0.3)';
    for (let i = 0; i < 26; i++) crack(g, s, Math.random() * s, Math.random() * s, Math.random() * 6.28, 30 + Math.random() * 70, 1);
    // old stains, spreading from where something dripped
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 20 + Math.random() * 60, grad = g.createRadialGradient(x, y, r * 0.3, x, y, r);
      grad.addColorStop(0, 'rgba(60,55,45,0.2)'); grad.addColorStop(0.8, 'rgba(60,55,45,0.1)'); grad.addColorStop(1, 'rgba(60,55,45,0)');
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    grain(g, s, 30);
  });
}

// Moon dust: grey, grainy, blotched, and pocked with little craters (a dark hollow with a bright far edge).
export function regolithTexture() {
  return canvas(2048, (g, s) => {
    g.fillStyle = '#b9b8ba';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 160, 0.09);
    for (let i = 0; i < 620; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 2 + Math.random() * Math.random() * 44;
      for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {   // (wrapped copies: it tiles)
        g.fillStyle = 'rgba(40, 40, 46, 0.22)';
        g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(245, 245, 250, 0.28)'; g.lineWidth = Math.max(1, r * 0.16);
        g.beginPath(); g.arc(x + ox, y + oy, r, -0.5, 1.9); g.stroke();
        g.strokeStyle = 'rgba(20, 20, 26, 0.3)';
        g.beginPath(); g.arc(x + ox, y + oy, r * 0.92, 2.6, 5); g.stroke();
      }
    }
    for (let i = 0; i < 7000; i++) {   // stones
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

// Smooth ramp concrete: no joints. Poured in boards (the faint lines of them), pored, and scuffed by wheels.
export function rampTexture() {
  return canvas(512, (g, s) => {
    g.fillStyle = '#9a9994';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 26, 0.06);
    for (let y = 0; y < s; y += s / 8) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, y, s, 2); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y + 2, s, 1); }
    specks(g, s, 500, 0.5, 1.6, true);
    g.strokeStyle = 'rgba(20,20,22,0.16)';   // wheel marks: long, nearly straight, in sheaves
    for (let i = 0; i < 30; i++) { const x = Math.random() * s, lean = (Math.random() - 0.5) * 60; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); g.moveTo(x, -10); g.lineTo(x + lean, s + 10); g.stroke(); }
    g.strokeStyle = 'rgba(30,30,30,0.35)';
    for (let i = 0; i < 4; i++) crack(g, s, Math.random() * s, Math.random() * s, Math.random() * 6.28, 60 + Math.random() * 80, 1);
    grain(g, s, 20);
  });
}

// Stone block wall: coursed blocks of different lengths, deep joints, some cracked through, moss in the joints and
// creeping up from the foot, damp running down from the top.
export function stoneWallTexture() {
  return canvas(1024, (g, s) => {
    g.fillStyle = '#1f1e1c';   // (the mortar: deep in the joints)
    g.fillRect(0, 0, s, s);
    const rows = 10, h = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -(r % 2) * 60 - Math.random() * 40;
      while (x < s) {
        const w = 90 + Math.random() * 110, v = 88 + Math.random() * 55, inset = 4 + Math.random() * 2;
        for (const ox of [0, -s]) {
          g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.92})`;
          g.beginPath(); g.roundRect(x + ox + inset, r * h + inset, w - inset * 2, h - inset * 2, 5); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + ox + inset, r * h + inset, w - inset * 2, 3);            // light on its top edge
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + ox + inset, (r + 1) * h - inset - 4, w - inset * 2, 4);       // shadow under it
        }
        if (Math.random() < 0.22) { g.strokeStyle = 'rgba(15,15,15,0.7)'; crack(g, s, x + w * (0.3 + Math.random() * 0.4), r * h + 4, 1.57 + (Math.random() - 0.5) * 0.8, h, 1.6, 2); }
        x += w;
      }
    }
    specks(g, s, 700, 0.8, 2.6, true);
    blotches(g, s, 50, 0.1);
    for (let i = 0; i < 160; i++) {   // moss: in clumps along the joints
      const x = Math.random() * s, y = Math.round(Math.random() * rows) * h + (Math.random() - 0.5) * 14, r = 4 + Math.random() * 12;
      g.fillStyle = `rgba(${52 + Math.random() * 30},${78 + Math.random() * 30},40,0.4)`;
      g.beginPath(); g.ellipse(x, y, r * 1.8, r, 0, 0, 7); g.fill();
    }
    const moss = g.createLinearGradient(0, s * 0.6, 0, s);
    moss.addColorStop(0, 'rgba(50,70,40,0)');
    moss.addColorStop(1, 'rgba(50,70,40,0.3)');
    g.fillStyle = moss;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {   // damp, running down
      const x = Math.random() * s, w = 6 + Math.random() * 16, len = s * (0.2 + Math.random() * 0.5), run = g.createLinearGradient(0, 0, 0, len);
      run.addColorStop(0, 'rgba(10,12,10,0.3)'); run.addColorStop(1, 'rgba(10,12,10,0)');
      g.fillStyle = run; g.fillRect(x, 0, w, len);
    }
    grain(g, s, 24);
  });
}

// Weathered stone for headstones and crypts: pitted, chipped, streaked by rain, with lichen on it.
export function stoneTexture() {
  return canvas(512, (g, s) => {
    g.fillStyle = '#8b8a84';
    g.fillRect(0, 0, s, s);
    blotches(g, s, 44, 0.12);
    specks(g, s, 650, 0.5, 2.4, true);
    for (let i = 0; i < 34; i++) {   // rain streaks
      const x = Math.random() * s, w = 3 + Math.random() * 9, y = Math.random() * s * 0.5, len = s * (0.25 + Math.random() * 0.5), run = g.createLinearGradient(0, y, 0, y + len);
      const dark = Math.random() < 0.7;
      run.addColorStop(0, dark ? 'rgba(25,26,24,0.28)' : 'rgba(225,225,215,0.2)'); run.addColorStop(1, 'rgba(25,26,24,0)');
      g.fillStyle = run; g.fillRect(x, y, w, len);
    }
    for (let i = 0; i < 70; i++) {   // lichen: pale green-grey and mustard rosettes
      const x = Math.random() * s, y = Math.random() * s, r = 3 + Math.random() * 11, yellow = Math.random() < 0.3;
      g.fillStyle = yellow ? 'rgba(170,150,60,0.35)' : 'rgba(120,140,105,0.38)';
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, r * (0.4 + Math.random() * 0.5), 0, 7); g.fill(); }
    }
    g.strokeStyle = 'rgba(20,20,20,0.5)';
    for (let i = 0; i < 5; i++) crack(g, s, Math.random() * s, Math.random() * s, Math.random() * 6.28, 60 + Math.random() * 120, 1.3);
    grain(g, s, 30);
  });
}

// A supply crate's side: pressed steel panels, ribbed, riveted, scuffed, with its markings stencilled on.
export function crateTexture() {
  return canvas(1024, (g, s) => {
    g.fillStyle = '#b4b8bf'; g.fillRect(0, 0, s, s);
    blotches(g, s, 40, 0.07);
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(i * s / 8 + s / 16 - 9, 0, 6, s); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(i * s / 8 + s / 16 - 3, 0, 4, s); }   // ribs
    g.strokeStyle = 'rgba(20,22,26,0.55)'; g.lineWidth = 10; g.strokeRect(14, 14, s - 28, s - 28);
    for (let i = 0; i < 16; i++) for (const [x, y] of [[40 + i * (s - 80) / 15, 40], [40 + i * (s - 80) / 15, s - 40], [40, 40 + i * (s - 80) / 15], [s - 40, 40 + i * (s - 80) / 15]]) { g.fillStyle = 'rgba(30,32,36,0.6)'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x - 2, y - 2, 3, 0, 7); g.fill(); }
    g.save(); g.translate(s / 2, s * 0.2); g.fillStyle = '#d9a52a'; g.fillRect(-s * 0.36, -34, s * 0.72, 68); g.fillStyle = '#1b1c1f';
    for (let x = -s * 0.36; x < s * 0.36; x += 70) { g.beginPath(); g.moveTo(x, 34); g.lineTo(x + 35, 34); g.lineTo(x + 70, -34); g.lineTo(x + 35, -34); g.fill(); } g.restore();   // a hazard band
    g.fillStyle = 'rgba(24,26,30,0.85)'; g.textAlign = 'center'; g.font = '900 120px Impact, sans-serif'; g.fillText('DEADSLIDE', s / 2, s * 0.52);
    g.font = '700 54px "Arial Black", sans-serif'; g.fillText('LUNAR SUPPLY  \u00b7  07', s / 2, s * 0.64);
    g.font = '700 40px "Arial Black", sans-serif'; g.fillText('BOOF  \u2014  KEEP DRY  \u2014  THIS WAY UP \u2191', s / 2, s * 0.8);
    g.strokeStyle = 'rgba(40,40,44,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 90; i++) { const x = Math.random() * s, y = Math.random() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 160, y + (Math.random() - 0.5) * 30); g.stroke(); }   // scuffs
    grain(g, s, 22);
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

// The House: a marble floor in black and white squares (one tile of the texture is 2 x 2 squares).
export function marbleTexture() {
  return canvas(512, (g, s) => {
    const h = s / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#1b1a1c' : '#ece6d8';
      g.fillRect(i * h, j * h, h, h);
    }
    for (let i = 0; i < 26; i++) {   // veins
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '120,110,100' : '250,245,235'}, 0.16)`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 120; y += (Math.random() - 0.5) * 120; g.lineTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(201, 164, 74, 0.55)'; g.lineWidth = 3;
    g.strokeRect(0, 0, h, h); g.strokeRect(h, h, h, h); g.strokeRect(h, 0, h, h); g.strokeRect(0, h, h, h);
    grain(g, s, 10);
  });
}
