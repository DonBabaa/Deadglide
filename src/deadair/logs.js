// The crew's logs: Jun Park's nine recorders, one a day, hidden about the station for whoever came. Three are put out
// each run, of the days you have not found yet (the first run, always day one by the first body in the bay), each in a
// spot of its own from a pool of them; the ones you find are kept in this browser, so the whole nine take several nights.
//
//   const logs = createLogs({ scene, spots: LOG_SPOTS });
//   logs.place()                 a new run: three recorders put out
//   logs.offer(pos) -> { text, price, act } | null     (E, standing by one)
//   logs.take(day) -> { day, text, who, pos } | null  (what it says: index.js plays the card, the voice and the cut-in)
//   logs.update(dt, time)        the LEDs blink
//   logs.count / logs.all / logs.found
import * as THREE from 'three';
import { load, store } from '../systems/storage.js';

export const WHO = 'Jun Park';
export const LOGS = [
  { day: 1, text: "The drill's through to the cavern. Kask says it's ice. It isn't." },
  { day: 2, text: 'Something in the ice. Cold storage. Kask sealed it.' },
  { day: 3, text: 'It got up.' },
  { day: 4, text: 'Dima and Kask held the door. Two keys on everything, from now on.' },
  { day: 5, text: "Dima went out to the beacon. He came back. He didn't." },
  { day: 6, text: 'Okoye sealed Med Bay with the bitten inside. With her inside.' },
  { day: 7, text: 'Benny took the shuttle for the dome. "I\'m not waiting this time."' },
  { day: 8, text: "Priya says she hears them better when she doesn't move. She hasn't moved since." },
  { day: 9, text: "Kask's at the core. One hand. If anyone comes down here: we were here." },
];
export const CREW = ['Theodora Kask', 'Dmitri Volkov', 'Ama Okoye', 'Rafa Mendes', 'Priya Raman', 'Benny Lau', 'Lou Mastrangelo', 'Jun Park'];
const KEY = 'deadair.logs', PER_RUN = 3;

export function createLogs({ scene, spots }) {
  let found = new Set();
  try { const saved = JSON.parse(load(KEY) || '[]'); if (Array.isArray(saved)) found = new Set(saved.map((d) => +d).filter((d) => d >= 1 && d <= 9)); } catch {}
  const group = new THREE.Group();
  scene.add(group);
  const placed = [];   // [{ day, pos, mesh, taken }]
  const shell = new THREE.MeshStandardMaterial({ color: 0x25272b, metalness: 0.5, roughness: 0.6 });
  const led = new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false });
  // A recorder: a small dark box on the floor, a red LED blinking on it, the glow of it on the plates.
  function recorder() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 0.11), shell); box.position.y = 0.03; box.castShadow = true; g.add(box);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), led); dot.position.set(0.055, 0.065, 0.03); g.add(dot);
    const glow = new THREE.PointLight(0xff2a14, 0.6, 1.4, 1.8); glow.position.set(0, 0.12, 0); g.add(glow);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.05), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 })); grille.position.set(-0.03, 0.063, 0); g.add(grille);
    return g;
  }
  const api = {
    LOGS, WHO, CREW,
    get found() { return found; },
    get count() { return found.size; },
    get all() { return found.size >= LOGS.length; },
    get placed() { return placed; },
    clear() { group.clear(); placed.length = 0; },
    // A run: three of the days not found yet (day one first, until it is), each in a spot of its own.
    place(rng = Math.random) {
      api.clear();
      const left = LOGS.map((l) => l.day).filter((d) => !found.has(d));
      const days = [];
      if (left.includes(1)) days.push(1);
      const rest = left.filter((d) => d !== 1).sort(() => rng() - 0.5);
      while (days.length < PER_RUN && rest.length) days.push(rest.shift());
      const pool = spots.slice(1).sort(() => rng() - 0.5);
      for (const day of days) {
        const s = day === 1 ? spots[0] : pool.pop();
        if (!s) break;
        const mesh = recorder();
        mesh.position.set(s[0], s[3] || 0, s[1]); mesh.rotation.y = s[2] || 0;
        group.add(mesh);
        placed.push({ day, pos: new THREE.Vector3(s[0], 0, s[1]), mesh, taken: false });
      }
      return days;
    },
    offer(pos) {
      const p = placed.find((l) => !l.taken && Math.hypot(l.pos.x - pos.x, l.pos.z - pos.z) < 1.9);
      if (!p) return null;
      return { text: `Press E  ·  a recorder  ·  ${found.size} of ${LOGS.length} found`, price: 0, log: p.day, act: () => api.take(p.day) };
    },
    // Taken (by you, or by a friend: the find is everyone's): kept, and what it says.
    take(day) {
      const p = placed.find((l) => l.day === day);
      if (p) { p.taken = true; p.mesh.visible = false; }
      const fresh = !found.has(day);
      found.add(day);
      try { store(KEY, JSON.stringify([...found].sort((a, b) => a - b))); } catch {}
      const l = LOGS[day - 1];
      return l ? { day, text: l.text, who: WHO, pos: p ? p.pos.clone() : null, fresh } : null;
    },
    update(dt, time) {
      for (const p of placed) {
        if (p.taken) continue;
        const on = Math.sin(time * 5.5 + p.day * 1.7) > 0.2;
        p.mesh.children[1].visible = on || !!p.loud;
        p.mesh.children[2].intensity = p.loud ? 2.4 : on ? 0.7 : 0.05;
      }
    },
    // (the tests: forget everything found)
    forget() { found = new Set(); try { store(KEY, '[]'); } catch {} },
  };
  return api;
}
