// three.js draws a see-through, two-sided material in two passes a frame (its back faces, then its front) and flags it
// for a shader re-check before each (material.needsUpdate): on every frame, for every one in view. For what this game
// has of them (panes of glass, signs, the dome's lines, light cones and fading sheets) that buys nothing to see: they
// are drawn once, both sides together. Swept over a scene now and then (main.js), so that what is made later is caught.
export function singlePass(root) {
  root?.traverse((o) => {
    const m = o.material;
    if (!m) return;
    if (Array.isArray(m)) { for (const x of m) if (x.transparent && x.side === 2 && !x.forceSinglePass) x.forceSinglePass = true; }
    else if (m.transparent && m.side === 2 && !m.forceSinglePass) m.forceSinglePass = true;   // (2: THREE.DoubleSide)
  });
}
