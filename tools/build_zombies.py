# More zombies: public/models/zombies.glb, from the characters that come inside some of the clips in dl/ (not in the
# repository; Mixamo's, see public/models/CREDITS.txt).
#
#   blender --background --python tools/build_zombies.py -- dl public/models/zombies.glb
#
# A monster in the game is not a skinned body: it is a handful of stiff parts (body, head, two arms, two legs), each
# an instanced mesh hinged where it joins him (src/enemies/horde.js, realMobs.js). So each character here is stood with
# his arms down, cut into those parts along his joints, and saved with every part sat at its hinge:
#   <name>_body, _head, _arm_l, _arm_r, _leg_l, _leg_r        the one drawn close to
#   <name>_lite_...                                           the same, far lighter, for the crowd
# A part painted on two pictures is saved as two objects (<name>_head, <name>_head2): one picture each.
# (knees.js cuts each leg again at the knee; mobAnims.js moves the lot by motion capture.)
#
# He keeps his pictures: his skin (the diffuse, 1024 square, JPEG) and the bumps in it (the normal map, 512 square).
# He was painted for daylight and is met at night, so the game lightens him: by how much is in his material's name
# (zombieb|1.9). His colours are also put on his points, the old way, for anything that draws him without a picture.
import bpy, sys, os, math, traceback
import numpy as np
from mathutils import Matrix, Vector

a = sys.argv[sys.argv.index('--') + 1:]
DL, OUT = os.path.abspath(a[0]), os.path.abspath(a[1])
TALL = 1.8            # how tall each is made (m): what the game's zombie is
SKIN_PX, BUMP_PX = 1024, 512
# name -> (the file he is in, how many triangles close to, and far off, how much lighter he is made, and how tall he is
# made if not a zombie's height: a boss is the height his kind is in src/enemies/types.js)
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


def image_of(mat, socket):
    """The picture plugged into that socket of the material's shader (or, for the bumps, into its normal map node)."""
    if not (mat and mat.use_nodes):
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            for l in n.outputs['Color'].links:
                if l.to_socket.name == socket:
                    return n.image
                if socket == 'Normal' and l.to_node.type == 'NORMAL_MAP':
                    return n.image
    return None


def resampled(img, px, label):
    """A new picture, px square, made from img by averaging its pixels in blocks (Blender's own scale() is not always what
    the exporter writes)."""
    W, H = img.size
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
    if W > px or H > px:
        fy, fx = max(1, H // px), max(1, W // px)
        arr = arr[:fy * (H // fy), :fx * (W // fx)].reshape(H // fy, fy, W // fx, fx, 4).mean(axis=(1, 3))
    h, w = arr.shape[:2]
    out = bpy.data.images.new(label, w, h, alpha=False)
    out.colorspace_settings.name = img.colorspace_settings.name
    out.pixels.foreach_set(arr.ravel())
    out.pack()
    return out


def simple(mat, slot, name, gain, shrunk):
    """The material remade with only its skin and its bumps (what the game can draw), its pictures shrunk."""
    skin, bump = image_of(mat, 'Base Color'), image_of(mat, 'Normal')
    if bump is None:
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and 'normal' in n.image.name.lower() + n.image.filepath.lower():
                bump = n.image
    out = bpy.data.materials.new(f'{name}|{gain}|{slot}')   # (unique: Blender would rename a second one, number and all)
    out.use_nodes = True
    tree = out.node_tree
    shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Roughness'].default_value = 0.8
    def shrink(img, px):
        key = (img.name, px)
        if key not in shrunk:
            shrunk[key] = resampled(img, px, f'{name}_{"skin" if px == SKIN_PX else "bump"}_{len(shrunk)}')
        return shrunk[key]
    if skin is not None:
        t = tree.nodes.new('ShaderNodeTexImage')
        t.image = shrink(skin, SKIN_PX)
        tree.links.new(t.outputs['Color'], shader.inputs['Base Color'])
    if bump is not None:
        t = tree.nodes.new('ShaderNodeTexImage')
        bump.colorspace_settings.name = 'Non-Color'
        t.image = shrink(bump, BUMP_PX)
        nm = tree.nodes.new('ShaderNodeNormalMap')
        tree.links.new(t.outputs['Color'], nm.inputs['Color'])
        tree.links.new(nm.outputs['Normal'], shader.inputs['Normal'])
    return out


def skin(name, file, fine, lite, gain, tall=TALL):
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

    # His colours, off his picture and onto his points too (lighter: he was painted for daylight, and is met at night).
    mesh = body.data
    uv = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    at = np.empty(len(mesh.loops), dtype=np.int64)
    mesh.loops.foreach_get('vertex_index', at)
    of = np.empty(len(mesh.polygons), dtype=np.int64)
    mesh.polygons.foreach_get('material_index', of)
    sides = np.empty(len(mesh.polygons), dtype=np.int64)
    mesh.polygons.foreach_get('loop_total', sides)
    loop_of = np.repeat(of, sides)
    seen = np.zeros((len(mesh.loops), 3), dtype=np.float32)
    for slot, mat in enumerate(mesh.materials):
        image = image_of(mat, 'Base Color')
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
    colour = np.clip((total / np.maximum(count, 1)[:, None]) ** 2.2 * gain + 0.004, 0, 1)
    layer = mesh.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    layer.data.foreach_set('color', np.hstack([colour, np.ones((len(colour), 1))]).ravel())
    # His pictures stay: each material remade with only its skin and its bumps, shrunk.
    shrunk = {}
    remade = [simple(mat, slot, name, gain, shrunk) for slot, mat in enumerate(mesh.materials)]
    for attr in [a for a in mesh.color_attributes if a.name != 'Color']:   # (only the colours made here: the file's own are not wanted)
        mesh.color_attributes.remove(attr)
    for slot, mat in enumerate(remade):
        mesh.materials[slot] = mat

    # Stood on the ground, the middle of him over the middle of it, the game's zombie's height.
    P = points(body)
    low, high = P[:, 2].min(), P[:, 2].max()
    k = tall / (high - low)
    middle = Vector((float((hinge['leg_l'].x + hinge['leg_r'].x) / 2), float((hinge['leg_l'].y + hinge['leg_r'].y) / 2), float(low)))
    fit = lambda p: (Vector(p) - middle) * k
    body.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-middle))
    hinge = {part: fit(p) for part, p in hinge.items()}
    hinge['body'] = Vector((0, 0, 0))

    def belongs_of(whole):
        groups = {g.index: part_of(g.name) for g in whole.vertex_groups}
        out = []
        for v in whole.data.vertices:
            share = {}
            for g in v.groups:
                share[groups[g.group]] = share.get(groups[g.group], 0) + g.weight
            out.append(max(share, key=share.get) if share else 'body')
        return out

    def separate(whole, keep):
        """The selected faces of `whole`, off as an object of their own (None if none were selected)."""
        picked = 0
        for poly in whole.data.polygons:
            poly.select = keep(poly)
            picked += poly.select
        if not picked:
            return None
        had = set(bpy.data.objects)
        only(whole)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        return next(iter(set(bpy.data.objects) - had))

    def cut(source, tag, most):
        """`source`, thinned to about `most` triangles and cut into his parts (and each part by its picture): each an
        object of its own, sat at its hinge."""
        only(source)
        bpy.ops.object.duplicate()
        whole = bpy.context.view_layer.objects.active
        tris = sum(len(p.vertices) - 2 for p in whole.data.polygons)
        if tris > most:
            mod = whole.modifiers.new('thin', 'DECIMATE')
            mod.ratio = most / tris
            bpy.ops.object.modifier_apply(modifier=mod.name)
        only(whole)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_mode(type='FACE')
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')
        made = 0
        pieces = []
        for part in ('head', 'arm_l', 'arm_r', 'leg_l', 'leg_r', 'body'):
            if part != 'body':
                belongs = belongs_of(whole)
                piece = separate(whole, lambda poly: sum(belongs[v] == part for v in poly.vertices) * 2 > len(poly.vertices))
                if piece is None:
                    continue
            else:
                piece = whole
            # (a part painted on two pictures: one object per picture, the second named with a 2 after it)
            slots = sorted({poly.material_index for poly in piece.data.polygons})
            bits = [piece]
            for n, slot in enumerate(slots[1:], start=2):
                other = separate(piece, lambda poly, s=slot: poly.material_index == s)
                if other is not None:
                    bits.append(other)
            for n, bit in enumerate(bits):
                bit.name = f'{name}_{tag}{part}{n + 1 if n else ""}'
                bit.data.name = bit.name
                bit.data.transform(Matrix.Translation(-hinge[part]))
                bit.location = hinge[part]
                bit.vertex_groups.clear()
                for poly in bit.data.polygons:
                    poly.use_smooth = True
                # (only the picture its faces are on)
                used = sorted({poly.material_index for poly in bit.data.polygons})
                if len(used) == 1 and len(bit.data.materials) > 1:
                    keep = bit.data.materials[used[0]]
                    for poly in bit.data.polygons:
                        poly.material_index = 0
                    bit.data.materials.clear()
                    bit.data.materials.append(keep)
                made += sum(len(p.vertices) - 2 for p in bit.data.polygons)
                pieces.append(bit.name)
        return made, pieces
    fine_tris, fine_parts = cut(body, '', fine)
    lite_tris, lite_parts = cut(body, 'lite_', lite)
    print('SKIN', name, 'from', file, ':', fine_tris, 'triangles close to', fine_parts, ';', lite_tris, 'far off; hinges', {p: [round(c, 3) for c in v] for p, v in hinge.items()})
    bpy.data.objects.remove(body, do_unlink=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name, (file, fine, lite, gain, *more) in SKINS.items():
        if not os.path.exists(os.path.join(DL, file)):
            print('MISSING', file)
            continue
        try:
            skin(name, file, fine, lite, gain, more[0] if more else TALL)
        except Exception:
            traceback.print_exc()
    for o in bpy.data.objects:
        o.select_set(o.type == 'MESH')
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    opts = dict(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=False, export_yup=True, export_materials='EXPORT', export_image_format='JPEG')
    for key, value in (('export_jpeg_quality', 82), ('export_image_quality', 82)):
        if key in props:
            opts[key] = value
    bpy.ops.export_scene.gltf(**opts)
    print('EXPORTED', OUT, os.path.getsize(OUT))


try:
    main()
except Exception:
    traceback.print_exc()
