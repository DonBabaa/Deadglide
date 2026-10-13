# The rat: public/models/rat.glb, from the low-poly rat in dl/ (not in the repository: see public/models/CREDITS.txt).
#
#   blender --background --python tools/build_rat.py -- dl public/models/rat.glb
#
# A monster in the game is a handful of stiff parts, coloured by its points (src/enemies/horde.js, realMobs.js). The
# rat's are numbered, as the one it replaces was made (tools/build_mobs.py):
#   rat_p0 its body and head   rat_p1 its eyes (lit)   rat_p2 its tail   rat_p3..6 its legs: front right, front left,
#   hind right, hind left (the game's x runs to its left)                rat_lite_p<n>: the same, plainer, for a crowd
# The model has no bones in it, so it is cut where its own shape says: its legs are what hangs below its belly, fore
# and aft; its tail is what is behind its rump. It is made to face the way the game's monsters face, stood on the
# ground, as tall as the game's rat. (How it runs is motion capture off another rat: tools/build_mob_anims.py.)
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
DL, OUT = os.path.abspath(a[0]), os.path.abspath(a[1])
FILE, PICTURE = 'low-poly-rat/source/Ratlow.fbx', 'low-poly-rat/textures/Ratlow_Rat_AlbedoTransparency.png'
TALL = 0.5            # its back, off the ground (m)
GAIN = 1.5            # how much lighter its colours are made (it is met in the dark)
# Where it is cut, in the model's own measure (y: along it, from its nose at -0.6 to the end of its tail at 4.84;
# z: up, its feet at -0.955 and its back at 0.57):
BELLY = -0.56         # what is below this, under its shoulders or its hips, is a leg
FRONT, HIND = (0.25, 1.05), (1.38, 2.47)   # ...and this far along it
RUMP = 2.5            # what is behind this is its tail
EYES = (0.2, -0.04, 0.17)                  # an eye: out to the side, along, up


def only(o):
    for ob in bpy.data.objects:
        ob.select_set(ob is o)
    bpy.context.view_layer.objects.active = o


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(DL, FILE))
    rat = next(o for o in bpy.data.objects if o.type == 'MESH')
    only(rat)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    image = bpy.data.images.load(os.path.join(DL, PICTURE))
    W, H = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(H, W, 4)[:, :, :3]
    shared = bpy.data.materials.new('Rat')
    shared.use_nodes = True
    col = shared.node_tree.nodes.new('ShaderNodeVertexColor')
    col.layer_name = 'Color'
    shared.node_tree.links.new(col.outputs['Color'], next(n for n in shared.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'])
    lo_z = min(v.co.z for v in rat.data.vertices)
    k = TALL / (0.57 - lo_z)
    middle = Vector((0, 0.95, lo_z))
    G = lambda p: (Vector(p) - middle) * k                      # the model's measure -> metres, stood on the ground

    def version(tag, cuts):
        """The whole rat again, with `cuts` rounds of finer faces (more points to carry its colours), cut into its parts."""
        only(rat)
        bpy.ops.object.duplicate()
        whole = bpy.context.view_layer.objects.active
        if cuts:
            mod = whole.modifiers.new('fine', 'SUBSURF')
            mod.subdivision_type = 'SIMPLE'
            mod.levels = cuts
            bpy.ops.object.modifier_apply(modifier=mod.name)
        mesh = whole.data
        # its colours, off its picture and onto its points
        uv = np.empty(len(mesh.loops) * 2, dtype=np.float32); mesh.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
        at = np.empty(len(mesh.loops), dtype=np.int64); mesh.loops.foreach_get('vertex_index', at)
        seen = px[np.clip((uv[:, 1] % 1.0 * H).astype(int), 0, H - 1), np.clip((uv[:, 0] % 1.0 * W).astype(int), 0, W - 1)]
        total = np.zeros((len(mesh.vertices), 3)); count = np.zeros(len(mesh.vertices))
        np.add.at(total, at, seen); np.add.at(count, at, 1)
        colour = np.clip((total / np.maximum(count, 1)[:, None]) ** 2.2 * GAIN + 0.004, 0, 1)
        layer = mesh.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
        layer.data.foreach_set('color', np.hstack([colour, np.ones((len(colour), 1))]).ravel())
        mesh.materials.clear(); mesh.materials.append(shared)

        def take(name, test, hinge):
            """The faces of `whole` that pass `test` (the middle of one, in the model's measure), as a part sat at `hinge`."""
            only(whole)
            bpy.ops.object.mode_set(mode='EDIT')
            bm = bmesh.from_edit_mesh(whole.data)
            for f in bm.faces:
                f.select = bool(test(f.calc_center_median()))
            bmesh.update_edit_mesh(whole.data)
            got = any(f.select for f in bm.faces)
            if got:
                bpy.ops.mesh.separate(type='SELECTED')
            bpy.ops.object.mode_set(mode='OBJECT')
            if not got:
                return None
            part = next(o for o in bpy.context.selected_objects if o is not whole)
            return sit(part, name, hinge)

        def sit(part, name, hinge):
            part.name = part.data.name = name
            part.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-middle))
            at = G(hinge) if hinge else Vector((0, 0, 0))
            part.data.transform(Matrix.Translation(-at))
            part.location = at
            only(part)
            bpy.ops.object.shade_smooth()
            return part

        made = []
        legs = [('p3', -1, FRONT), ('p4', 1, FRONT), ('p5', -1, HIND), ('p6', 1, HIND)]     # (the game's left is the model's -x: it is turned to face the other way on the way out)
        for n, side, (y0, y1) in legs:
            pts = [v.co for v in whole.data.vertices if v.co.z < BELLY and y0 <= v.co.y <= y1 and v.co.x * side < -0.02]
            mid = (sum(pts, Vector()) / len(pts)) if pts else Vector((-side * 0.33, (y0 + y1) / 2, BELLY))
            made.append(take(f'rat_{tag}{n}', lambda c: c.z < BELLY and y0 <= c.y <= y1 and c.x * side < 0, (mid.x, mid.y, BELLY + 0.1)))
        made.append(take(f'rat_{tag}p2', lambda c: c.y > RUMP, (0, RUMP, -0.36)))
        made.append(sit(whole, f'rat_{tag}p0', None))
        # its eyes: two beads, lit
        bpy.ops.object.select_all(action='DESELECT')
        beads = []
        for side in (-1, 1):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.034, location=(side * EYES[0], EYES[1], EYES[2]))
            beads.append(bpy.context.view_layer.objects.active)
        for o in bpy.data.objects:
            o.select_set(o in beads)
        bpy.context.view_layer.objects.active = beads[0]
        bpy.ops.object.join()
        eyes = beads[0]
        only(eyes)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        red = eyes.data.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
        red.data.foreach_set('color', np.tile(np.array([1.0, 0.25, 0.1, 1.0]), len(eyes.data.vertices)))
        eyes.data.materials.append(shared)
        made.append(sit(eyes, f'rat_{tag}p1', None))
        return [m for m in made if m]

    made = version('', 2) + version('lite_', 0)
    bpy.data.objects.remove(rat, do_unlink=True)
    for o in made:
        print('PART', o.name, len(o.data.polygons), 'faces, hinge', [round(v, 3) for v in o.location])
    for o in bpy.data.objects:
        o.select_set(o in made)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=False, export_yup=True, export_materials='EXPORT')
    print('WROTE', OUT, os.path.getsize(OUT))


main()
