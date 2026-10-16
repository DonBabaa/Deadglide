// Out of DEAD AIR, on the Moon (a win): once the scene at the surface has played, the card: YOU GOT OUT, the round, the
// kills, and the crew's scores (points for kills, heads, friends got up), best first. Then, by the lift, the Mastre of
// the Month: a statue of Kirky in gold on a plinth, and on the plinth's brass plate the name of whichever of you did worst.
//
//   const out = createOutCard({ scene, airlock, SkaterModel, onClose });
//   out.show(results)        results: { title, line, crew: [{ name, kills, heads, revives, score }], worst }
//   out.update(dt)           (the statue holds its pose)
import * as THREE from 'three';

function plateTexture(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#c9a24a'); grd.addColorStop(0.5, '#f1d27a'); grd.addColorStop(1, '#9c7a2c');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#5a4416'; g.lineWidth = 10; g.strokeRect(10, 10, 492, 236);
  for (const [x, y] of [[30, 30], [482, 30], [30, 226], [482, 226]]) { g.fillStyle = '#6b5420'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
  g.fillStyle = '#3a2a08'; g.textAlign = 'center';
  g.font = '700 34px Anton, Impact, sans-serif'; g.fillText('MASTRE OF THE MONTH', 256, 74);
  g.font = '700 70px Anton, Impact, sans-serif'; g.fillText(String(name || 'KIRKY').toUpperCase().slice(0, 16), 256, 160);
  g.font = 'italic 600 24px "Barlow Condensed", sans-serif'; g.fillText('the worst of them, this time  ·  Shackleton Station', 256, 210);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createOutCard({ scene, airlock, SkaterModel, onClose = () => {}, cutscenes = null }) {
  // The card (HTML, over the game).
  const card = document.createElement('div');
  card.id = 'out-card';
  card.innerHTML = '<div class="box"><h1></h1><p class="line"></p><ol class="crew"></ol><p class="mastre"></p><button type="button">Carry on</button></div>';
  document.body.append(card);
  let statue = null, plinth = null, plate = null;
  let worstName = 'Kirky';
  // (closing the card: a few seconds on the statue, coming round it to the plate, MASTRE OF THE MONTH and the name)
  const close = () => {
    card.classList.remove('on');
    if (cutscenes && plinth && !cutscenes.active) {
      const P = plinth.position.clone(), f = new THREE.Vector3(Math.sin(plinth.rotation.y), 0, Math.cos(plinth.rotation.y)), sd = new THREE.Vector3(f.z, 0, -f.x);
      cutscenes.story([
        { for: 2.6, line: `Mastre of the Month: ${worstName}. The worst of them, this time.`, cam: (k) => ({ eye: P.clone().addScaledVector(f, 4.2 - 1.2 * k).addScaledVector(sd, 2.6 - 3.4 * k).setY(P.y + 1.4 + 0.5 * k), target: P.clone().setY(P.y + 1.9), fov: 44 }) },
        { for: 2.2, line: `Mastre of the Month: ${worstName}. The worst of them, this time.`, cam: (k) => ({ eye: P.clone().addScaledVector(f, 1.5 - 0.15 * k).setY(P.y + 0.85), target: P.clone().addScaledVector(f, 0.6).setY(P.y + 0.72), fov: 36 }) },
      ], () => onClose(), 0.6, null, true);
    } else onClose();
  };
  card.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); close(); });

  // The statue: him, gold all over, stood on a plinth by the lift, on the open side of its runway.
  function raise(name) {
    const A = airlock.place, turn = airlock.cage?.parent?.rotation.y || 0;
    const at = new THREE.Vector3(A.x, A.y, A.z).add(new THREE.Vector3(5.2, 0, -5.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn));
    const face = Math.atan2(-(at.x - A.x) - Math.sin(turn) * 6, -(at.z - A.z) - Math.cos(turn) * 6);   // (turned out to the plaza, a little toward the way in)
    if (!plinth) {
      const stone = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, roughness: 0.8, metalness: 0.1 });
      plinth = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.25, 1.5), stone); base.position.y = 0.125;
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), stone); body.position.y = 0.7;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 1.4), stone); cap.position.y = 1.22;
      for (const m of [base, body, cap]) { m.castShadow = m.receiveShadow = true; plinth.add(m); }
      plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ map: plateTexture(name), metalness: 0.8, roughness: 0.35 }));
      plate.position.set(0, 0.72, 0.605); plinth.add(plate);
      const light = new THREE.SpotLight(0xffe2a8, 40, 9, 0.5, 0.6, 1.4); light.position.set(0, 4.2, 2.2); light.target.position.set(0, 1.6, 0); plinth.add(light, light.target);
      scene.add(plinth);
    } else { plate.material.map?.dispose(); plate.material.map = plateTexture(name); plate.material.needsUpdate = true; }
    plinth.position.copy(at); plinth.rotation.y = face; plinth.visible = true;
    if (!statue) {
      statue = new SkaterModel(scene);
      statue.board.visible = false;
      statue.rider.position.y = 0; statue.rider.rotation.y = 0;
      statue.gold = new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 1, roughness: 0.28, emissive: 0x2a1c00, emissiveIntensity: 0.4 });
    }
    statue.root.position.set(at.x, at.y + 1.29, at.z);
    statue.root.rotation.set(0, face, 0);
    statue.root.visible = true;
    statue.gilt = false;
  }
  return {
    get open() { return card.classList.contains('on'); },
    show(results) {
      if (!results) return;
      card.querySelector('h1').textContent = results.title || 'YOU GOT OUT';
      card.querySelector('.line').textContent = results.line || '';
      card.querySelector('.crew').innerHTML = (results.crew || []).map((t) => `<li><b>${String(t.name).replace(/</g, '')}</b> <span>${t.kills} killed · ${t.heads || 0} heads · ${t.revives || 0} got up</span> <em>${t.score}</em></li>`).join('');
      const worst = results.worst?.name || 'Kirky';
      worstName = worst;
      card.querySelector('.mastre').textContent = `Mastre of the Month: ${worst}  ·  the statue is by the lift`;
      card.classList.add('on');
      document.exitPointerLock?.();
      raise(worst);
    },
    update() {
      if (!statue || !statue.root.visible) return;
      // (held in one pose: his own idle, a moment into it; and gilded, every piece of him, once his body is on)
      statue.play?.('idle', 1, 0, 1.2, true);
      if (!statue.gilt && statue.body) { statue.gilt = true; statue.root.traverse((o) => { if (o.isMesh && !o.isSprite) { o.material = statue.gold; o.castShadow = true; } }); }
    },
  };
}
