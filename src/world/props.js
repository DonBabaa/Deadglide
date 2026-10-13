// The set pieces that are modelled in Blender (public/models/props.glb: see tools/build_props.py): the casino from
// outside, the exit portal's ring, the bone that falls in Bone Rain. props() resolves to { name: geometry } once the
// file has arrived (or to {} if it never does: whoever asked keeps what it built for itself).
import { loadModel } from '../models.js';

let loading = null;
export function props() {
  loading ||= loadModel('props.glb').then((gltf) => {
    const found = {};
    gltf.scene.traverse((o) => { if (o.isMesh) found[o.name] = o.geometry; });
    return found;
  }, () => ({}));
  return loading;
}
