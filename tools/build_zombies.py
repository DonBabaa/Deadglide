# More zombies: public/models/zombies.glb, from the characters that come inside some of the clips in dl/ (not in the
# repository; Mixamo's, see public/models/CREDITS.txt).
#
#   blender --background --python tools/build_zombies.py -- dl public/models/zombies.glb
#
# A monster in the game is not a skinned body: it is a handful of stiff parts (body, head, two arms, two legs), each
# an instanced mesh hinged where it joins him, coloured by its points and not by a picture (src/enemies/horde.js,
# realMobs.js). So each character here is stood with his arms down, cut into those parts along his joints, given the
# colours of his picture on his points, and saved with every part sat at its hinge:
#   <name>_body, _head, _arm_l, _arm_r, _leg_l, _leg_r        the one drawn close to
#   <name>_lite_...                                           the same, far lighter, for the crowd
# (knees.js cuts each leg again at the knee; mobAnims.js moves the lot by motion capture.)
import bpy, sys, os, math, traceback
import numpy as np
from mathutils import Matrix, Vector

a = sys.argv[sys.argv.index('--') + 1:]
DL, OUT = os.path.abspath(a[0]), os.path.abspath(a[1])
TALL = 1.8            # how tall each is made (m): what the game's zombie is
# name -> (the file he is in, how many triangles close to, and far off, how much lighter his colours are made, and
# how tall he is made if not a zombie's height: a boss is the height his kind is in src/enemies/types.js)
SKINS = {
    'zombieb': ('Crouched To Sprinting.fbx', 15000, 2600, 1.9),       # a soldier, in what is left of his uniform and cap
    'zombiec': ('Sprint.fbx', 26000, 2600, 2.6),                      # gaunt, bare to the waist, in boots
    'boss': ('hamzitus goyitus.fbx', 12000, 2600, 1.7, 1.95),         # Hamzitus Goyitus: split open down the chest, all teeth
    'boss2': ('rubistus goyitus.fbx', 13000, 2600, 1.7, 2.2),         # Rubistus Goyitus: a skull on a brute, claws to his knees
}
ARM = ('Arm', 'ForeArm', 'Hand')
LEG = ('UpLeg', 'Leg', 'Foot', 'Toe')


def only(o):
    for ob in bpy.data.objects:
        ob.select_set(ob is o)
    bpy.context.view_layer.objects.active = o


def points(o):
    pts = np.empty(len(o.data.vertices) * 3, dtype=np.float64)
    o.data.vertices.foreach_get('co', pts)
    return pts.reshape(-1, 3)


def part_of(bone):
    """Which part of him a bone moves."""
    name = bone.split(':')[-1]
    for side, s in (('Left', 'l'), ('Right', 'r')):
        if name.startswith(side):
            rest = name[len(side):]
            if rest.startswith(ARM) and not rest.startswith('Shoulder'):
                return 'arm_' + s
            if rest.startswith(LEG):
                return 'leg_' + s
            if rest.startswith('Eye'):
                return 'head'
    return 'head' if name.startswith(('Head', 'Jaw')) else 'body'


def skin(name, file, fine, lite, gain, shared, tall=TALL):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(DL, file))
    new = set(bpy.data.objects) - before
    arm = next(o for o in new if o.type == 'ARMATURE')
    meshes = [o for o in new if o.type == 'MESH']
    arm.animation_data_clear()
    for pb in arm.pose.bones:
        pb.location, pb.rotation_quaternion, pb.rotation_euler, pb.scale = (0, 0, 0), (1, 0, 0, 0), (0, 0, 0), (1, 1, 1)
    bpy.context.view_layer.update()
    # Arms down from straight out (he was made standing like a T): his shoulders are then the shape they will mostly be.
    bone = lambda n: next(pb for pb in arm.pose.bones if pb.name.split(':')[-1] == n)
    for side, turn in (('Left', -1), ('Right', 1)):
        pb = bone(side + 'Arm')
        at = pb.head.copy()
        pb.matrix = Matrix.Translation(at) @ Matrix.Rotation(math.radians(55) * turn, 4, 'Z') @ Matrix.Translation(-at) @ pb.matrix
        bpy.context.view_layer.update()
    for o in meshes:
        only(o)
        for mod in list(o.modifiers):
            if mod.type == 'ARMATURE':
                bpy.ops.object.modifier_apply(modifier=mod.name)
    hinge = {part: (arm.matrix_world @ bone(b).head).copy() for part, b in (('head', 'Head'), ('arm_l', 'LeftArm'), ('arm_r', 'RightArm'), ('leg_l', 'LeftUpLeg'), ('leg_r', 'RightUpLeg'))}
    for o in meshes:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
    for ob in bpy.data.objects:
        ob.select_set(ob in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.data.objects.remove(arm, do_unlink=True)

    # His colours, off his picture and onto his points (the game draws him by those; and lighter: he was painted for
    # daylight, and is met at night).
    mesh = body.data
    uv = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    at = np.empty(len(mesh.loops), dtype=np.int64)
    mesh.loops.foreach_get('vertex_index', at)
    # (each face off the picture of the material it is in: some of them are painted on two)
    of = np.empty(len(mesh.polygons), dtype=np.int64)
    mesh.polygons.foreach_get('material_index', of)
    sides = np.empty(len(mesh.polygons), dtype=np.int64)
    mesh.polygons.foreach_get('loop_total', sides)
    loop_of = np.repeat(of, sides)
    seen = np.zeros((len(mesh.loops), 3), dtype=np.float32)
    for slot, mat in enumerate(mesh.materials):
        image = None
        if mat and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and any(l.to_socket.name == 'Base Color' for l in n.outputs['Color'].links):
                    image = n.image
        if image is None:
            continue
        W, H = image.size
        px = np.array(image.pixels[:], dtype=np.float32).reshape(H, W, 4)[:, :, :3]
        mine = loop_of == slot
        seen[mine] = px[np.clip((uv[mine, 1] % 1.0 * H).astype(int), 0, H - 1), np.clip((uv[mine, 0] % 1.0 * W).astype(int), 0, W - 1)]
    total = np.zeros((len(mesh.vertices), 3), dtype=np.float64)
    count = np.zeros(len(mesh.vertices), dtype=np.float64)
    np.add.at(total, at, seen)
    np.add.at(count, at, 1)
    colour = np.clip((total / np.maximum(count, 1)[:, None]) ** 2.2 * gain + 0.004, 0, 1)      # (from the picture's own scale to light itself)
    layer = mesh.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    layer.data.foreach_set('color', np.hstack([colour, np.ones((len(colour), 1))]).ravel())
    mesh.materials.clear()
    mesh.materials.append(shared)

    # Stood on the ground, the middle of him over the middle of it, the game's zombie's height.
    P = points(body)
    low, high = P[:, 2].min(), P[:, 2].max()
    k = tall / (high - low)
    middle = Vector((float((hinge['leg_l'].x + hinge['leg_r'].x) / 2), float((hinge['leg_l'].y + hinge['leg_r'].y) / 2), float(low)))
    fit = lambda p: (Vector(p) - middle) * k
    body.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-middle))
    hinge = {part: fit(p) for part, p in hinge.items()}
    hinge['body'] = Vector((0, 0, 0))

    def cut(source, tag, most):
        """`source`, thinned to about `most` triangles and cut into his parts: each an object of its own, sat at its hinge."""
        only(source)
        bpy.ops.object.duplicate()
        whole = bpy.context.view_layer.objects.active
        tris = sum(len(p.vertices) - 2 for p in whole.data.polygons)
        if tris > most:
            mod = whole.modifiers.new('thin', 'DECIMATE')
            mod.ratio = most / tris
            bpy.ops.object.modifier_apply(modifier=mod.name)
        groups = {g.index: part_of(g.name) for g in whole.vertex_groups}
        belongs = []
        for v in whole.data.vertices:
            share = {}
            for g in v.groups:
                share[groups[g.group]] = share.get(groups[g.group], 0) + g.weight
            belongs.append(max(share, key=share.get) if share else 'body')
        made = 0
        for part in ('head', 'arm_l', 'arm_r', 'leg_l', 'leg_r', 'body'):
            if part != 'body':
                only(whole)
                bpy.ops.object.mode_set(mode='EDIT')
                bpy.ops.mesh.select_mode(type='FACE')
                bpy.ops.mesh.select_all(action='DESELECT')
                bpy.ops.object.mode_set(mode='OBJECT')
                picked = 0
                for poly in whole.data.polygons:
                    poly.select = sum(belongs[v] == part for v in poly.vertices) * 2 > len(poly.vertices)
                    picked += poly.select
                if not picked:
                    continue
                had = set(bpy.data.objects)
                bpy.ops.object.mode_set(mode='EDIT')
                bpy.ops.mesh.separate(type='SELECTED')
                bpy.ops.object.mode_set(mode='OBJECT')
                piece = next(iter(set(bpy.data.objects) - had))
                # (which part each of what is left belongs to: its points have been numbered again)
                groups = {g.index: part_of(g.name) for g in whole.vertex_groups}
                belongs = []
                for v in whole.data.vertices:
                    share = {}
                    for g in v.groups:
                        share[groups[g.group]] = share.get(groups[g.group], 0) + g.weight
                    belongs.append(max(share, key=share.get) if share else 'body')
            else:
                piece = whole
            piece.name = f'{name}_{tag}{part}'
            piece.data.name = piece.name
            piece.data.transform(Matrix.Translation(-hinge[part]))
            piece.location = hinge[part]
            piece.vertex_groups.clear()
            for poly in piece.data.polygons:
                poly.use_smooth = True
            made += sum(len(p.vertices) - 2 for p in piece.data.polygons)
        return made
    print('SKIN', name, 'from', file, ':', cut(body, '', fine), 'triangles close to,', cut(body, 'lite_', lite), 'far off; hinges', {p: [round(c, 3) for c in v] for p, v in hinge.items()})
    bpy.data.objects.remove(body, do_unlink=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shared = bpy.data.materials.new('Zombie')
    shared.use_nodes = True
    tree = shared.node_tree
    shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    col = tree.nodes.new('ShaderNodeVertexColor')
    col.layer_name = 'Color'
    tree.links.new(col.outputs['Color'], shader.inputs['Base Color'])
    for name, (file, fine, lite, gain, *more) in SKINS.items():
        if not os.path.exists(os.path.join(DL, file)):
            print('MISSING', file)
            continue
        try:
            skin(name, file, fine, lite, gain, shared, more[0] if more else TALL)
        except Exception:
            traceback.print_exc()
    for o in bpy.data.objects:
        o.select_set(o.type == 'MESH')
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=False, export_yup=True, export_materials='EXPORT')
    print('EXPORTED', OUT, os.path.getsize(OUT))


try:
    main()
except Exception:
    traceback.print_exc()
