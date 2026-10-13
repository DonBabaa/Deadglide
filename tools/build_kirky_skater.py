# Builds a skater skin for Kirky: spare/kirky_skater.glb (not the one the game loads: that is the man in the
# fedora, tools/build_kirky.py. This one is kept as a second skin, on the same skeleton names; it is out of
# public/models so that nobody downloads a megabyte and a half of a man they never see. To use him, put him back there.)
#
#   blender --background --python tools/build_kirky_skater.py -- spare/kirky_skater.glb [preview.png] [dl/skater.glb]
#
# He is made from a skater somebody else modelled (dl/skater.glb, not in the repository: a MakeHuman man on
# MakeHuman's game skeleton, in a T-shirt, tight trousers, skate shoes and a knitted hat; see public/models/CREDITS.txt),
# cut to the look he was drawn with:
#   - an oversized black T-shirt (wide, long, sleeves to the elbow) with a white one showing under its hem; the game
#     dyes the shirt and prints its chest, so here it is left a pale grey, and its chest gets a patch for the print
#   - baggy black jeans that stack on his shoes
#   - white skate shoes
#   - short black hair in place of the hat (the top of his head was cut away under it: his hair is built over the hole)
#   - headphones on his head, tinted glasses, and a blue backpack with a red pocket and red straps
# Nothing of the skater's own shirt print or his shoes' maker's marks is kept: both are painted out.
import bpy, sys, os, math, traceback
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0])
PREVIEW = os.path.abspath(args[1]) if len(args) > 1 and args[1].endswith('.png') else None
BASE = os.path.abspath(next((a for a in args[1:] if a.endswith('.glb')), 'dl/skater.glb'))
TEXTURE = 1024   # the longest side of any texture, in pixels


def world_points(o):
    pts = np.empty(len(o.data.vertices) * 3, dtype=np.float64)
    o.data.vertices.foreach_get('co', pts)
    pts = pts.reshape(-1, 3)
    m = np.array(o.matrix_world)
    return pts @ m[:3, :3].T + m[:3, 3]


def set_world_points(o, pts):
    m = np.array(o.matrix_world.inverted())
    local = pts @ m[:3, :3].T + m[:3, 3]
    o.data.vertices.foreach_set('co', local.ravel())
    o.data.update()


def pixels(image):
    W, H = image.size
    return np.array(image.pixels[:], dtype=np.float32).reshape(H, W, 4)


def put(image, px):
    image.pixels[:] = px.ravel()
    image.update()


def paint3d(o, image, fn, blend=1.0):
    """Paint on a mesh's texture by where things are on the mesh itself: fn(points, normals) is given every pixel's
    place on the model (N x 3, in metres) and which way the surface faces there, and gives back (which pixels, colours),
    or (which pixels, colours, how strongly each: 0..1)."""
    W, H = image.size
    px = pixels(image)
    mesh = o.data
    mesh.calc_loop_triangles()
    pts = world_points(o)
    uv = mesh.uv_layers.active.data
    rot = np.array(o.matrix_world)[:3, :3]
    done = 0
    seen = np.zeros((H, W), dtype=bool)          # (a pixel on the edge two faces share is painted once, not twice)
    for tri in mesh.loop_triangles:
        P = pts[list(tri.vertices)]
        T = np.array([[uv[l].uv[0] * W, uv[l].uv[1] * H] for l in tri.loops])
        x0, y0 = np.floor(T.min(0)).astype(int) - 1
        x1, y1 = np.ceil(T.max(0)).astype(int) + 1
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        if x1 <= x0 or y1 <= y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        d = (T[1, 1] - T[2, 1]) * (T[0, 0] - T[2, 0]) + (T[2, 0] - T[1, 0]) * (T[0, 1] - T[2, 1])
        if abs(d) < 1e-9:
            continue
        a = ((T[1, 1] - T[2, 1]) * (gx - T[2, 0]) + (T[2, 0] - T[1, 0]) * (gy - T[2, 1])) / d
        b = ((T[2, 1] - T[0, 1]) * (gx - T[2, 0]) + (T[0, 0] - T[2, 0]) * (gy - T[2, 1])) / d
        c = 1 - a - b
        e = 0.6 / max(1.0, abs(d) ** 0.5)          # (a little over the edges, so no seam is left unpainted)
        inside = (a >= -e) & (b >= -e) & (c >= -e)
        if not inside.any():
            continue
        where = a[inside, None] * P[0] + b[inside, None] * P[1] + c[inside, None] * P[2]
        normal = rot @ np.array(tri.normal)
        got = fn(where, np.repeat(normal[None, :], len(where), 0))
        hit, colour, thin = got if len(got) == 3 else (got[0], got[1], None)
        if hit is None:
            continue
        ys, xs = np.nonzero(inside)
        hit = hit & ~seen[ys + y0, xs + x0]
        if not hit.any():
            continue
        seen[ys[hit] + y0, xs[hit] + x0] = True
        was = px[ys[hit] + y0, xs[hit] + x0, :3]
        k = blend * (thin[hit][:, None] if thin is not None else 1.0)
        px[ys[hit] + y0, xs[hit] + x0, :3] = was * (1 - k) + (colour[hit] if getattr(colour, 'ndim', 1) == 2 else colour) * k
        done += int(hit.sum())
    put(image, px)
    return done


def coverage(o, image, grow=3):
    """Which pixels of a picture a mesh is coloured by (and a few round them)."""
    W, H = image.size
    mask = np.zeros((H, W), dtype=bool)
    mesh = o.data
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers.active.data
    for tri in mesh.loop_triangles:
        T = np.array([[uv[l].uv[0] * W, uv[l].uv[1] * H] for l in tri.loops])
        x0, y0 = np.floor(T.min(0)).astype(int) - 1
        x1, y1 = np.ceil(T.max(0)).astype(int) + 1
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        if x1 <= x0 or y1 <= y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        d = (T[1, 1] - T[2, 1]) * (T[0, 0] - T[2, 0]) + (T[2, 0] - T[1, 0]) * (T[0, 1] - T[2, 1])
        if abs(d) < 1e-9:
            continue
        a = ((T[1, 1] - T[2, 1]) * (gx - T[2, 0]) + (T[2, 0] - T[1, 0]) * (gy - T[2, 1])) / d
        b = ((T[2, 1] - T[0, 1]) * (gx - T[2, 0]) + (T[0, 0] - T[2, 0]) * (gy - T[2, 1])) / d
        mask[y0:y1, x0:x1] |= (a >= -0.02) & (b >= -0.02) & (1 - a - b >= -0.02)
    for _ in range(grow):
        mask[1:] |= mask[:-1]; mask[:-1] |= mask[1:]; mask[:, 1:] |= mask[:, :-1]; mask[:, :-1] |= mask[:, 1:]
    return mask


def only(o):
    for ob in bpy.data.objects:
        ob.select_set(ob is o)
    bpy.context.view_layer.objects.active = o


def split_off(o, pick, name):
    """The faces `pick` says yes to (it is given the face) become an object of their own."""
    only(o)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    n = 0
    for poly in o.data.polygons:
        poly.select = bool(pick(poly))
        n += poly.select
    if not n or n == len(o.data.polygons):
        return None
    before = set(bpy.data.objects)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    new = next(iter(set(bpy.data.objects) - before), None)
    if new:
        new.name = name
    return new


def picture(o):
    """The picture a mesh is coloured by."""
    for slot in o.material_slots:
        m = slot.material
        if m and m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and any(l.to_socket.name == 'Base Color' for l in n.outputs['Color'].links):
                    return n.image
    return None


def plain(o, name, image=None, colour=None, rough=0.85, paint=False):
    """One plain material on a mesh: a picture, or a colour, or the colours painted on its points; nothing else."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Roughness'].default_value = rough
    if image:
        tex = tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    elif paint:
        col = tree.nodes.new('ShaderNodeVertexColor')
        col.layer_name = 'Color'
        tree.links.new(col.outputs['Color'], shader.inputs['Base Color'])
    elif colour is not None:
        shader.inputs['Base Color'].default_value = (*colour, 1)
    o.data.materials.clear()
    o.data.materials.append(mat)
    return mat


smooth = lambda k: (lambda t: t * t * (3 - 2 * t))(np.clip(k, 0, 1))


def noise(P, scale, seed=0.0):
    """A soft noise, 0..1, from where a point is."""
    a = np.sin(P[:, 0] * scale + seed + 1.7 * np.sin(P[:, 2] * scale * 0.71 + seed)) * np.sin(P[:, 1] * scale * 1.13 + 2 * seed + 1.3 * np.sin(P[:, 0] * scale * 0.83))
    b = np.sin(P[:, 2] * scale * 1.31 + 3 * seed + 1.1 * np.sin(P[:, 1] * scale * 0.57))
    return np.clip(0.5 + 0.3 * a + 0.25 * b, 0, 1)


# ---- Things made from nothing (what he wears that the skater did not) ----
def new_mesh(name, verts, faces, colours=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    for p in mesh.polygons:
        p.use_smooth = True
    if colours is not None:
        layer = mesh.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
        for i, c in enumerate(colours):
            layer.data[i].color = (*c, 1)
    return o


def tube(path, radii, colour, ring=10, flat=1.0, cap=True):
    """A tube along a line of points: (points, a colour for each of them), for new_mesh. flat: how far it is pressed
    flat (1: round), across the way it bends."""
    path = [Vector(p) for p in path]
    radii = radii if hasattr(radii, '__len__') else [radii] * len(path)
    V, F, C = [], [], []
    up = Vector((0, 0, 1))
    side = None
    for i, p in enumerate(path):
        d = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        s = d.cross(up)
        if s.length < 1e-4:
            s = d.cross(Vector((0, 1, 0)))
        s.normalize()
        if side is not None and s.dot(side) < 0:
            s = -s
        side = s
        n = s.cross(d).normalized()
        for k in range(ring):
            a = 2 * math.pi * k / ring
            V.append(p + s * math.cos(a) * radii[i] + n * math.sin(a) * radii[i] * flat)
            C.append(colour)
    for i in range(len(path) - 1):
        for k in range(ring):
            a, b = i * ring + k, i * ring + (k + 1) % ring
            F.append((a, b, b + ring, a + ring))
    if cap:
        F.append(tuple(range(ring - 1, -1, -1)))
        F.append(tuple(range((len(path) - 1) * ring, len(path) * ring)))
    return V, F, C


def blob(centre, size, colour, rings=10, around=16, squash=None):
    """A ball, pressed to the size given (its half-widths): points, faces, colours. squash(v): bend each point of it."""
    V, F, C = [], [], []
    for i in range(rings + 1):
        el = -math.pi / 2 + math.pi * i / rings
        for k in range(around):
            az = 2 * math.pi * k / around
            v = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
            # (boxier than a ball: its corners pushed out)
            m = max(abs(v.x), abs(v.y), abs(v.z))
            v = v.lerp(v / m, 0.45)
            if squash:
                v = squash(v)
            V.append(Vector(centre) + Vector((v.x * size[0], v.y * size[1], v.z * size[2])))
            C.append(colour)
    for i in range(rings):
        for k in range(around):
            a, b = i * around + k, i * around + (k + 1) % around
            F.append((a, b, b + around, a + around))
    return V, F, C


def gather(name, pieces):
    """Several (points, faces, colours) as one mesh."""
    V, F, C = [], [], []
    for v, f, c in pieces:
        n = len(V)
        V += v
        C += c
        F += [tuple(i + n for i in face) for face in f]
    return new_mesh(name, V, F, C)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=BASE, bone_heuristic='BLENDER')
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    worn = [o for o in bpy.data.objects if o.type == 'MESH' and o.find_armature() is rig]
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o not in worn:
            bpy.data.objects.remove(o, do_unlink=True)          # (his board, and a stray ball)
    # As he was made, not as he was left standing: no animation, nothing holding him but himself, feet on the ground.
    rig.animation_data_clear()
    for pb in rig.pose.bones:
        pb.location, pb.rotation_quaternion, pb.rotation_euler, pb.scale = (0, 0, 0), (1, 0, 0, 0), (0, 0, 0), (1, 1, 1)
    bpy.context.view_layer.update()
    for o in worn + [rig]:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
    for o in list(bpy.data.objects):
        if o.type == 'EMPTY':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    sole = min(float(world_points(o)[:, 2].min()) for o in worn if 'shoes' in o.name.lower())
    for o in worn + [rig]:
        o.location.z -= sole
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in worn:
        o.parent = rig
    # The skeleton, by the names the game knows it by.
    only(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in list(rig.data.edit_bones):
        if eb.name.endswith('rootJoint'):
            rig.data.edit_bones.remove(eb)
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in rig.data.bones:
        if b.name.endswith('_human'):
            b.name = b.name[:-6]
    rig.name = 'Kirky'
    bone = lambda name: rig.matrix_world @ rig.data.bones[name].head_local
    print('STANDS', round(sole, 3), 'above where he was; hips', [round(v, 3) for v in bone('thigh_l')], 'head', [round(v, 3) for v in bone('head')])

    def dominant(o):
        names = {g.index: g.name for g in o.vertex_groups}
        out = []
        for v in o.data.vertices:
            best = max(v.groups, key=lambda g: g.weight, default=None)
            out.append(names[best.group] if best else '')
        return out

    def bind(o, weights):
        """Hang a new mesh on the skeleton: weights = {bone: weight}, for all of it."""
        for name, w in weights.items():
            o.vertex_groups.new(name=name).add(range(len(o.data.vertices)), w, 'REPLACE')
        o.parent = rig
        o.modifiers.new('Armature', 'ARMATURE').object = rig

    find = lambda word: next((o for o in worn if word in o.name.lower()), None)
    body, eyes, hat, suit, shoes = find('body'), find('eyes'), find('hat'), find('suit'), find('shoes')
    atlas, skin, shoe_image, eye_image = picture(suit), picture(body), picture(shoes), picture(eyes)
    made = []          # what is exported: (object, name)

    # ---- His clothes: the shirt and the trousers come as one piece ----
    # (each is a piece of its own in it, not joined to the other: whatever piece reaches his chest is shirt)
    only(suit)
    before = set(bpy.data.objects)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    pieces = [suit] + list(set(bpy.data.objects) - before)
    chest_z = (rig.matrix_world @ rig.data.bones['spine_03'].head_local).z
    # (...and so is any scrap that is drawn from the shirt's part of the picture they share: the bottom of it. The
    # skater's shirt tail is one, a piece by itself)
    def low_on_picture(o):
        uv = o.data.uv_layers.active.data
        return sum(d.uv[1] for d in uv) / max(1, len(uv)) < 0.42
    for o in pieces:
        pts = world_points(o)
        print('  PIECE', len(o.data.polygons), 'faces, from', round(float(pts[:, 2].min()), 3), 'to', round(float(pts[:, 2].max()), 3), 'shirt' if low_on_picture(o) else 'trousers', 'by the picture')
    tops = [o for o in pieces if float(world_points(o)[:, 2].max()) > chest_z + 0.1 or low_on_picture(o)]
    legs = [o for o in pieces if o not in tops]
    print('SUIT', len(pieces), 'pieces:', len(tops), 'of shirt,', len(legs), 'of trousers')
    def joined(group, name):
        for ob in bpy.data.objects:
            ob.select_set(ob in group)
        bpy.context.view_layer.objects.active = group[0]
        if len(group) > 1:
            bpy.ops.object.join()
        group[0].name = name
        return group[0]
    shirt, pants = joined(tops, 'Shirt'), joined(legs, 'Pants')
    hipL, kneeL, ankleL, pelvis, waist, chest, neck = (bone(n) for n in ('thigh_l', 'calf_l', 'foot_l', 'pelvis', 'spine_01', 'spine_03', 'neck_01'))
    shoulderL, elbowL = bone('upperarm_l'), bone('lowerarm_l')

    # Baggy jeans: each leg let out round its own bones, more the further down it goes, and long enough to stack on
    # his shoes; the seat a little fuller.
    P = world_points(pants)
    top, hem = float(P[:, 2].max()), float(P[:, 2].min())
    mid = P[np.abs(P[:, 0]) < 0.012]
    crotch = float(mid[:, 2].min()) if len(mid) else hipL.z - 0.09
    LONG = (kneeL.z - 0.03) / (kneeL.z - hem)
    for i, (x, y, z) in enumerate(P):
        sd = 1.0 if x >= 0 else -1.0
        if z < crotch + 0.03:
            if z > kneeL.z:
                c = hipL.lerp(kneeL, min(1.0, max(0.0, (hipL.z - z) / (hipL.z - kneeL.z))))
            else:
                c = kneeL.lerp(ankleL, min(1.15, (kneeL.z - z) / (kneeL.z - ankleL.z)))
            s = min(1.0, max(0.0, (crotch + 0.03 - z) / (crotch + 0.03 - hem)))
            wide = 1.22 + 0.9 * float(smooth(s * 1.6)) + 0.1 * math.exp(-((s - 0.9) / 0.07) ** 2)     # (and it bunches, just above the hem)
            cx = sd * c.x * float(smooth(s / 0.22))                                                  # (round the middle of him at the fork, round its own leg below)
            nx = cx + (x - cx) * wide
            if sd * nx < 0.007:
                nx = sd * 0.007
            P[i] = (nx, c.y + (y - c.y) * (1 + (wide - 1) * 0.9), z if z > kneeL.z else kneeL.z - (kneeL.z - z) * LONG)
        else:
            k = min(1.0, max(0.0, (top - z) / (top - crotch)))
            wide = 1.05 + 0.17 * k
            P[i] = (x * wide, pelvis.y + (y - pelvis.y) * wide, z)
    set_world_points(pants, P)
    print('PANTS from', round(top, 3), 'to', round(float(P[:, 2].min()), 3), 'fork', round(crotch, 3))

    # An oversized T-shirt: the body of it wide and long, the sleeves wide and down to his elbows.
    P = world_points(shirt)
    dom = dominant(shirt)
    hem = float(P[:, 2].min())
    arm = (elbowL - shoulderL).normalized()
    reach = max([(Vector((abs(p[0]), p[1], p[2])) - shoulderL).dot(arm) for p, d in zip(P, dom) if d.startswith('upperarm')] or [0.1])
    WANT = (elbowL - shoulderL).length * 0.86
    # Its hem did not hang level (the skater wore it half tucked in): how low it came, each way round him, so that
    # each part of it can be let down by its own amount to one straight hem; and how far out his trousers are there,
    # so that none of it is left inside them.
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    bm.verts.ensure_lookup_table()
    SECT = 36
    lowest = [None] * SECT
    for e in bm.edges:
        if len(e.link_faces) != 1:
            continue
        for v in e.verts:
            x, y, z = P[v.index]
            if z < waist.z + 0.02 and not dom[v.index].startswith(('upperarm', 'lowerarm')):
                b = int(((math.atan2(y - waist.y, x) % (2 * math.pi)) / (2 * math.pi)) * SECT) % SECT
                lowest[b] = z if lowest[b] is None else min(lowest[b], z)
    bm.free()
    known = [z for z in lowest if z is not None]
    lowest = [z if z is not None else float(np.median(known)) for z in lowest]
    for _ in range(2):
        lowest = [(lowest[b - 1] + 2 * lowest[b] + lowest[(b + 1) % SECT]) / 4 for b in range(SECT)]
    HEM = hipL.z - 0.11
    def hem_at(x, y):
        f = ((math.atan2(y - waist.y, x) % (2 * math.pi)) / (2 * math.pi)) * SECT
        b = int(f) % SECT
        return lowest[b] + (lowest[(b + 1) % SECT] - lowest[b]) * (f - int(f))
    dg = bpy.context.evaluated_depsgraph_get()
    pants_tree = BVHTree.FromObject(pants, dg)
    print('SHIRT hem came between', round(min(lowest), 3), 'and', round(max(lowest), 3), '; cut at', round(HEM, 3))
    for i, (x, y, z) in enumerate(P):
        sd = 1.0 if x >= 0 else -1.0
        if dom[i].startswith(('upperarm', 'lowerarm')):
            rel = Vector((abs(x), y, z)) - shoulderL
            t = rel.dot(arm)
            off = rel - arm * t
            k = min(1.0, max(0.0, t / reach))
            q = shoulderL + arm * min(WANT, t * (1 + (WANT / reach - 1) * k)) + off * (1.0 + 0.75 * k) + Vector((0, 0, -0.03 * k * k))
            P[i] = (sd * q.x, q.y, q.z)
        else:
            k = float(smooth((chest.z + 0.16 - z) / 0.22))
            low = min(1.0, max(0.0, (chest.z - z) / (chest.z - hem)))                 # (and it stands off him more the lower it hangs)
            nx, ny = x * (1 + 0.17 * k + 0.14 * low), waist.y + (y - waist.y) * (1 + 0.2 * k + 0.16 * low)
            nz = z if z > waist.z else max(HEM, waist.z - (waist.z - z) * (waist.z - HEM) / max(0.03, waist.z - hem_at(x, y)))
            if nz < waist.z:      # (outside his trousers, wherever it now hangs over them)
                out = Vector((nx, ny - waist.y, 0))
                r = out.length
                if r > 1e-4:
                    out /= r
                    hit = pants_tree.ray_cast(Vector((0, waist.y, nz)) + out * 0.6, -out, 0.6)
                    if hit[0] is not None:
                        need = (hit[0] - Vector((0, waist.y, nz))).length + 0.012
                        if r < need:
                            nx, ny = out.x * need, waist.y + out.y * need
            P[i] = (nx, ny, nz)
    set_world_points(shirt, P)
    hem = float(P[:, 2].min())
    print('SHIRT hem', round(hem, 3), 'sleeve', round(reach, 3), '->', round(WANT, 3))
    for o in (shirt, pants):
        only(o)
        bpy.ops.object.shade_smooth()

    # The white T-shirt under it: its hem, showing below the black one's.
    # (a band hung from the black one's own hem, a little inside it and a hand lower, and bound to him exactly as the
    # hem above it is: so it goes where that hem goes, whatever he is doing)
    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    bm.verts.ensure_lookup_table()
    PS = world_points(shirt)
    V, F, src = [], [], []
    for e in bm.edges:
        if len(e.link_faces) != 1 or any(PS[v.index][2] > hem + 0.025 for v in e.verts):
            continue
        n = len(V)
        for v in e.verts:
            x, y, z = PS[v.index]
            out = Vector((x, y - waist.y, 0))
            r = out.length
            out = out / r if r > 1e-5 else Vector((1, 0, 0))
            for dz, dr in ((0.02, -0.006), (-0.012, -0.007), (-0.045, -0.012)):
                V.append(Vector((0, waist.y, z + dz)) + out * (r + dr))
                src.append(v.index)
        F += [(n, n + 3, n + 4, n + 1), (n + 1, n + 4, n + 5, n + 2)]
    bm.free()
    under = new_mesh('Hem', V, F)
    plain(under, 'Hem', colour=(0.85, 0.85, 0.83), rough=0.9)
    for poly in under.data.polygons:
        poly.use_smooth = False
    names = {g.index: g.name for g in shirt.vertex_groups}
    groups = {}
    for k, vi in enumerate(src):
        for g in shirt.data.vertices[vi].groups:
            if g.weight > 0.001:
                groups.setdefault(names[g.group], []).append((k, g.weight))
    for name, members in groups.items():
        vg = under.vertex_groups.new(name=name)
        for k, w in members:
            vg.add([k], w, 'REPLACE')
    under.parent = rig
    under.modifiers.new('Armature', 'ARMATURE').object = rig
    print('HEM', len(F), 'faces under the shirt')

    # ---- The picture his clothes are coloured by ----
    # The shirt's half: the skater's print painted out, and what is left (the cloth, its folds) made a pale grey for
    # the game to dye. The trousers' half: black denim (it came as something shinier).
    px = pixels(atlas)
    rgb = px[:, :, :3]
    is_tee, is_jeans = coverage(shirt, atlas, 4), coverage(pants, atlas, 4)
    is_tee &= ~coverage(pants, atlas, 0)
    lum = rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    printed = ((rgb.max(2) - rgb.min(2)) > 0.1) & is_tee
    cloth = float(np.median(lum[is_tee & ~printed & (lum > 0.4)]))
    # (round the print too: its edges are soft)
    grown = printed.copy()
    for _ in range(6):
        grown[1:] |= grown[:-1]; grown[:-1] |= grown[1:]; grown[:, 1:] |= grown[:, :-1]; grown[:, :-1] |= grown[:, 1:]
    grown &= is_tee
    pale = np.clip(0.8 + (np.where(grown, cloth, lum) - cloth) * 2.4, 0.3, 1.0)
    rgb[is_tee] = pale[is_tee][:, None]
    dark = np.clip(lum * 1.25 + 0.012, 0, 1)
    rgb[is_jeans] = np.stack([dark * 0.96, dark * 0.98, dark * 1.06], 2)[is_jeans]
    put(atlas, px)
    print('PRINT painted out:', int(grown.sum()), 'pixels; cloth', round(cloth, 3))
    # (more of a fold to the cloth than came with it: where the jeans hang and stack, where the shirt drapes)
    def jean_folds(Pn, N):
        s = np.clip((crotch - Pn[:, 2]) / max(1e-3, crotch), 0, 1)
        f = np.sin(Pn[:, 2] * (38 + 30 * s) + 4 * np.sin(Pn[:, 0] * 23 + Pn[:, 1] * 19)) * (0.35 + 0.65 * s)
        shade = 0.07 + 0.055 * f + 0.05 * noise(Pn, 31, 2.0)
        return np.ones(len(Pn), dtype=bool), np.stack([shade * 0.96, shade * 0.98, shade * 1.06], 1).astype(np.float32)
    print('JEANS', paint3d(pants, atlas, jean_folds, blend=0.45), 'pixels')
    def tee_folds(Pn, N):
        f = np.sin(Pn[:, 2] * 26 + 5 * np.sin(Pn[:, 0] * 11 + Pn[:, 1] * 9)) * np.sin(Pn[:, 0] * 17 + Pn[:, 2] * 7 + 2 * np.sin(Pn[:, 1] * 13))
        shade = 0.8 + 0.2 * f
        return np.ones(len(Pn), dtype=bool), np.repeat(shade[:, None], 3, 1).astype(np.float32)
    print('TEE', paint3d(shirt, atlas, tee_folds, blend=0.3), 'pixels')
    plain(shirt, 'Shirt', image=atlas)
    plain(pants, 'Pants', image=atlas, rough=0.9)
    made += [(shirt, 'Shirt'), (pants, 'Pants')] + ([(under, 'Hem')] if under else [])

    # ---- The print on his chest ----
    # A patch of the shirt's front, lifted a hair off it, for the game to draw its print on (so the shirt under it can
    # still be dyed any colour).
    Z0, Z1, HALF = chest.z + 0.0, chest.z + 0.2356, 0.17
    only(shirt)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    mw, rot = shirt.matrix_world, shirt.matrix_world.to_3x3()
    for poly in shirt.data.polygons:
        c, n = mw @ poly.center, rot @ poly.normal
        poly.select = n.y < -0.3 and c.y < waist.y and Z0 - 0.03 < c.z < Z1 + 0.03 and abs(c.x) < HALF + 0.03
    before = set(bpy.data.objects)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.duplicate()
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    logo = next(iter(set(bpy.data.objects) - before), None)
    if logo:
        logo.name = 'Logo'
        plain(logo, 'Logo', colour=(1, 1, 1))
        layer = logo.data.uv_layers.active
        for loop in logo.data.loops:
            p = logo.matrix_world @ logo.data.vertices[loop.vertex_index].co
            layer.data[loop.index].uv = ((p.x + HALF) / (2 * HALF), (p.z - Z0) / (Z1 - Z0))
        for vert in logo.data.vertices:
            vert.co += vert.normal * 0.003
        made.append((logo, 'Logo'))
        print('LOGO', len(logo.data.polygons), 'faces, from', round(Z0, 3), 'to', round(Z1, 3))

    # ---- His shoes: white, with a red tab at the heel ----
    # (painted over all of the upper: the stripe down its side and the name on its heel were its maker's)
    if shoe_image:
        px = pixels(shoe_image)
        rgb = px[:, :, :3]
        lum = rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
        red = (rgb[:, :, 0] > 0.45) & (rgb[:, :, 0] > 1.9 * rgb[:, :, 1]) & (rgb[:, :, 0] > 1.9 * rgb[:, :, 2])
        gum = (rgb[:, :, 0] > 1.25 * rgb[:, :, 2]) & (rgb[:, :, 0] > 0.2) & ~red            # the sole, underneath: left as it is
        edge = np.abs(np.gradient(lum, axis=0)) + np.abs(np.gradient(lum, axis=1))          # (stitching, the lines between its panels)
        white = np.clip(0.9 + 0.05 * lum - 1.6 * np.clip(edge - 0.03, 0, 0.2), 0.45, 1.0)
        upper = ~gum & ~red
        rgb[upper] = np.stack([white, white, white * 0.985], 2)[upper]
        for _ in range(4):
            red[1:] |= red[:-1]; red[:-1] |= red[1:]; red[:, 1:] |= red[:, :-1]; red[:, :-1] |= red[:, 1:]
        rgb[red] = np.array([0.72, 0.08, 0.07], dtype=np.float32)
        put(shoe_image, px)
        plain(shoes, 'Shoes', image=shoe_image, rough=0.7)
        print('SHOES', int(upper.sum()), 'pixels whitened,', int(red.sum()), 'red')
    made.append((shoes, 'Shoes'))

    # ---- His eyes: dark, and nothing over them ----
    # (each came inside a clear shell, which would be drawn solid: the shell goes)
    if eye_image:
        px = pixels(eye_image)
        W, Hh = eye_image.size
        euv = eyes.data.uv_layers.active.data
        def clear(poly):
            u = sum(euv[l].uv[0] for l in poly.loop_indices) / len(poly.loop_indices)
            v = sum(euv[l].uv[1] for l in poly.loop_indices) / len(poly.loop_indices)
            return px[min(Hh - 1, max(0, int(v * Hh))), min(W - 1, max(0, int(u * W))), 3] < 0.5
        shell = split_off(eyes, clear, 'EyeShell')
        if shell:
            bpy.data.objects.remove(shell, do_unlink=True)
        rgb = px[:, :, :3]
        iris = (rgb[:, :, 0] > 1.5 * rgb[:, :, 2]) & (rgb.max(2) < 0.75)
        rgb[iris] *= np.array([0.42, 0.34, 0.3], dtype=np.float32)
        px[:, :, 3] = 1
        put(eye_image, px)
        plain(eyes, 'Eyes', image=eye_image, rough=0.25)
    made.append((eyes, 'Eyes'))

    # ---- His hair: short and black, in place of the hat ----
    # The top of his head was cut away under the hat, so what goes in its place has to cover all the hat did: his
    # forehead (skin, as the rest of his face is: it goes on his face) up to where his hair starts, and his hair
    # from there. Both are built round the middle of his skull, a point for every direction out from it: as far out
    # as the hat was, less however thick the hat was (measured where he still has skin under it), and, for his hair,
    # the thickness of his hair. Tufted on top, ragged along his forehead.
    HP = world_points(hat)
    centre = Vector((0.0, float((HP[:, 1].min() + HP[:, 1].max()) / 2), float(HP[:, 2].min()) + 0.045))
    dg = bpy.context.evaluated_depsgraph_get()
    hat_tree = BVHTree.FromObject(hat, dg)
    body_tree = BVHTree.FromObject(body, dg)
    way = lambda az, el: Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))    # (az 0: straight ahead of him)
    def out_to(tree, d, far=0.4):
        hit = tree.ray_cast(centre + d * far, -d, far)
        return (hit[0] - centre).length if hit[0] is not None else None
    NA, FINE = 64, 72
    els = [math.radians(-40 + 130 * i / (FINE - 1)) for i in range(FINE)]
    rim, skull, edge = [], [], []        # per direction round him: where the hat's edge is; how far out his skull is, up from there; where his skin stops
    for j in range(NA):
        az = 2 * math.pi * j / NA
        hat_r = [out_to(hat_tree, way(az, el)) for el in els]
        skin_r = [out_to(body_tree, way(az, el)) for el in els]
        first = next((i for i, r in enumerate(hat_r) if r is not None), FINE - 1)
        last_skin = max([i for i, r in enumerate(skin_r) if r is not None and i >= first] or [first])
        # (how thick the hat is, here: from the highest point he still has skin under it)
        thick = hat_r[last_skin] - skin_r[last_skin] if skin_r[last_skin] is not None and hat_r[last_skin] is not None else None
        rim.append(els[first])
        edge.append(els[last_skin])
        skull.append((hat_r, skin_r, thick))
    known = [t for _, _, t in skull if t is not None]
    usual = float(np.median(known)) if known else 0.012
    thicks = [t if t is not None else usual for _, _, t in skull]
    for _ in range(4):
        thicks = [(thicks[j - 1] + 2 * thicks[j] + thicks[(j + 1) % NA]) / 4 for j in range(NA)]
        rim = [(rim[j - 1] + 2 * rim[j] + rim[(j + 1) % NA]) / 4 for j in range(NA)]
    def skull_at(j, el):
        """How far out his skull is, in direction j at height el: his skin where he has it, the hat less its thickness above."""
        hat_r, skin_r, _ = skull[j]
        f = (el - els[0]) / (els[-1] - els[0]) * (FINE - 1)
        i = int(max(0, min(FINE - 2, math.floor(f))))
        k = f - i
        def at(i):
            # (the hat's knit thins from its cuff, two layers of it, to its crown, one)
            t = thicks[j] * (1 - 0.5 * float(smooth((els[i] - edge[j]) / 0.5)))
            if skin_r[i] is not None and els[i] <= edge[j]:
                return skin_r[i]
            if hat_r[i] is not None:
                return hat_r[i] - t
            return None
        a, b = at(i), at(i + 1)
        if a is None and b is None:
            return 0.1
        return (a if b is None else b if a is None else a + (b - a) * k)
    # Where his hair starts: high over his forehead, down at his temples, and along the hat's edge from his ears back.
    def hairline(j):
        az = 2 * math.pi * j / NA
        front = max(0.0, math.cos(az))
        return max(rim[j], math.radians(-6) + math.radians(44) * float(smooth((front - 0.12) / 0.75)))
    rng = np.random.default_rng(7)
    NE = 13
    V, UV = [], []
    for j in range(NA):
        az = 2 * math.pi * j / NA
        lo = hairline(j) - math.radians(1.0) + math.radians(2.2) * float(rng.random() - 0.5) * max(0.0, math.cos(az))        # (ragged over his forehead)
        for i in range(NE):
            k = i / (NE - 1)
            el = lo + (math.pi / 2 - lo) * k
            thick = 0.0065 + 0.006 * float(smooth(k / 0.3)) + 0.007 * float(rng.random()) * float(smooth(k / 0.2)) * (0.5 + 0.5 * math.sin(az * 7 + k * 9) ** 2)
            V.append(centre + way(az, el) * (skull_at(j, el) + thick))
            UV.append((j / NA, k))
    # (smooth it once round and up, so it is hair and not a hat's faces)
    grid = np.array([list(v) for v in V]).reshape(NA, NE, 3)
    for _ in range(2):
        grid[:, 1:-1] = (np.roll(grid, 1, 0)[:, 1:-1] + np.roll(grid, -1, 0)[:, 1:-1] + grid[:, :-2] + grid[:, 2:] + 4 * grid[:, 1:-1]) / 8
    grid[:, -1] = grid[:, -1].mean(0)
    V = [Vector(p) for p in grid.reshape(-1, 3)]
    F = [(j * NE + i, ((j + 1) % NA) * NE + i, ((j + 1) % NA) * NE + i + 1, j * NE + i + 1) for j in range(NA) for i in range(NE - 1)]
    hair = new_mesh('HairTop', V, F)
    layer = hair.data.uv_layers.new(name='UVMap')
    for loop in hair.data.loops:
        layer.data[loop.index].uv = UV[loop.vertex_index]
    for poly in hair.data.polygons:      # (the seam: the last column meets the first, whose u is 0: there it is 1)
        us = [layer.data[l].uv[0] for l in poly.loop_indices]
        if max(us) - min(us) > 0.5:
            for l in poly.loop_indices:
                if layer.data[l].uv[0] < 0.5:
                    layer.data[l].uv[0] += 1.0
    S = 256
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / S
    strands = 0.5 + 0.5 * np.sin(xx * 610 + 2.5 * np.sin(yy * 9 + xx * 40)) * np.sin(xx * 233 + 1.7 * np.sin(yy * 5))
    shade = 0.016 + 0.05 * strands * (0.4 + 0.6 * yy) + 0.01 * rng.random((S, S), dtype=np.float32)
    hair_image = bpy.data.images.new('kirky_hair', S, S)
    put(hair_image, np.dstack([shade * 1.02, shade * 0.97, shade * 0.95, np.ones((S, S), dtype=np.float32)]))
    plain(hair, 'HairTop', image=hair_image, rough=0.6)
    bind(hair, {'head': 1.0})
    made.append((hair, 'HairTop'))
    crown = max(v.z for v in V)
    print('HAIR crown', round(crown, 3), 'rim', round(min(v.z for v in V), 3), 'centre', [round(c, 3) for c in centre], 'hat', round(usual, 4), 'thick')
    # His forehead: from a little under where his skin stops (out of sight there, under it) up to his hair. It takes
    # its colour from his own forehead (the same spot on the same picture), and is joined to his body.
    BP0 = world_points(body)
    buv = body.data.uv_layers.active.data
    # (the top of his forehead, where he has one: how its place on him goes to its place on the picture, carried on up)
    at3, at2 = [], []
    for poly in body.data.polygons:
        for l, vi in zip(poly.loop_indices, poly.vertices):
            p = body.matrix_world @ body.data.vertices[vi].co
            if p.z > centre.z + 0.028 and p.y < centre.y - 0.05 and abs(p.x) < 0.06:
                at3.append((p.x, p.z, 1.0))
                at2.append(tuple(buv[l].uv))
    lay = np.linalg.lstsq(np.array(at3), np.array(at2), rcond=None)[0] if len(at3) > 8 else np.array([[0.25, 0], [0, 0.12], [0.5, 0.5]])
    spot = [float(c) for c in (np.array([0.0, centre.z + 0.04, 1.0]) @ lay)]
    V, F, cols, NF = [], [], [], 7
    for j in range(NA):
        az = 2 * math.pi * j / NA
        lo, hi = edge[j] - math.radians(7), hairline(j) + math.radians(3)
        if hi - lo < math.radians(4) or math.cos(az) < -0.2:
            continue
        cols.append(j)
        for i in range(NF):
            el = lo + (hi - lo) * i / (NF - 1)
            sink = 0.0025 * (1 - float(smooth((el - edge[j] + math.radians(3)) / math.radians(5))))        # (under his skin where he has skin, level with it above)
            V.append(centre + way(az, el) * (skull_at(j, el) - sink))
    for c in range(len(cols) - 1):
        if cols[c + 1] - cols[c] != 1:
            continue
        for i in range(NF - 1):
            a, b = c * NF + i, (c + 1) * NF + i
            F.append((a, b, b + 1, a + 1))
    # (the columns run from his right temple round the back... no: they run 0 (ahead) up to a quarter turn, then from three quarters back to 0; join the two ends)
    if cols and cols[0] == 0 and cols[-1] == NA - 1:
        c0, c1 = len(cols) - 1, 0
        for i in range(NF - 1):
            a, b = c0 * NF + i, c1 * NF + i
            F.append((a, b, b + 1, a + 1))
    if F:
        brow = new_mesh('Forehead', V, F)
        layer = brow.data.uv_layers.new(name=body.data.uv_layers.active.name)
        for loop in brow.data.loops:
            p = brow.data.vertices[loop.vertex_index].co
            layer.data[loop.index].uv = tuple(float(c) for c in (np.array([p.x, p.z, 1.0]) @ lay))
        brow.data.materials.append(body.data.materials[0])
        brow.vertex_groups.new(name='head').add(range(len(brow.data.vertices)), 1.0, 'REPLACE')
        for ob in bpy.data.objects:
            ob.select_set(ob in (body, brow))
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.join()
        print('FOREHEAD', len(F), 'faces, coloured from', [round(c, 3) for c in spot])
    bpy.data.objects.remove(hat, do_unlink=True)

    # ---- His face ----
    # Black eyebrows, and the shadow of his hair where it meets his skin (painted on him, by where each point is).
    EP = world_points(eyes)
    eye = Vector((float(np.abs(EP[:, 0]).mean()), float(EP[:, 1].min()), float(EP[:, 2].mean())))
    def brows(Pn, N):
        x, z = np.abs(Pn[:, 0]), Pn[:, 2]
        arch = eye.z + 0.021 + 0.006 * np.cos((x - eye.x) / 0.03 * 1.4) - 0.004 * np.clip((x - eye.x) / 0.03, 0, 1)
        along = (x - eye.x * 1.02) / 0.029                                         # -1 at his nose's end of it, 1 at his temple's
        half = 0.0042 * (1.0 - 0.45 * np.clip(along, 0, 1) - 0.15 * np.clip(-along, 0, 1))
        thin = np.clip(1 - (np.abs(z - arch) / half) ** 2, 0, 1) * np.clip((1 - np.abs(along)) * 4, 0, 1) * (0.75 + 0.25 * noise(Pn, 2600, 4.0))
        hit = (N[:, 1] < -0.2) & (thin > 0.02)
        return hit, np.array([0.03, 0.024, 0.02], dtype=np.float32), thin
    print('BROWS', paint3d(body, skin, brows, blend=0.9), 'pixels')
    # (round the sides and back of his head, below his hair: cropped close, fading out down his neck and by his ears)
    starts = np.array([hairline(j) for j in range(NA)] + [hairline(0)])
    def cropped(Pn, N):
        rel = Pn - np.array(centre)
        az = np.arctan2(rel[:, 0], -rel[:, 1]) % (2 * math.pi)
        el = np.arctan2(rel[:, 2], np.hypot(rel[:, 0], rel[:, 1]))
        below = np.interp(az / (2 * math.pi) * NA, np.arange(NA + 1), starts) - el      # (how far below the edge of his hair: radians)
        back = np.clip(-np.cos(az) + 0.35, 0, 1)                                        # none of it on his forehead
        depth = 0.05 + 0.2 * back
        fade = np.clip(1 - below / depth, 0, 1) * np.clip(back * 3, 0, 1)
        speck = np.modf(np.abs(np.sin(Pn @ np.array([1271.0, 3117.0, 747.0])) * 43758.5))[0]
        hit = (below > -0.05) & (rel[:, 2] > -0.06) & (speck < fade * 0.9)
        return hit, np.array([0.05, 0.04, 0.035], dtype=np.float32)
    print('CROPPED', paint3d(body, skin, cropped, blend=0.75), 'pixels')

    # ---- What he wears on top of it all ----
    BP = world_points(body)
    dom = dominant(body)
    head_pts = BP[[i for i, d in enumerate(dom) if d == 'head']]
    far = np.abs(head_pts[:, 0]).max()
    ears = head_pts[np.abs(head_pts[:, 0]) > far - 0.012]
    ear = Vector((float(far), float(ears[:, 1].mean()), float(ears[:, 2].mean())))
    print('EAR', [round(v, 3) for v in ear], 'EYE', [round(v, 3) for v in eye])
    BLACK, DARK, STEEL, RED, BLUE, NAVY, AMBER = (0.02, 0.02, 0.022), (0.06, 0.06, 0.065), (0.45, 0.46, 0.48), (0.6, 0.05, 0.05), (0.07, 0.2, 0.62), (0.03, 0.08, 0.28), (0.95, 0.5, 0.08)

    # Headphones: a cup over each ear (a shell, a cushion against his head, a steel ring on the outside) and a band
    # over the top of his hair from one to the other.
    pieces = []
    for sd in (-1, 1):
        at = Vector((sd * (ear.x + 0.004), ear.y + 0.004, ear.z - 0.002))
        pieces.append(blob(at + Vector((sd * 0.018, 0, 0)), (0.019, 0.04, 0.046), BLACK, 8, 16))
        pieces.append(blob(at + Vector((sd * 0.003, 0, 0)), (0.011, 0.043, 0.049), DARK, 6, 16))
        pieces.append(tube([at + Vector((sd * 0.034, 0.028 * math.cos(a), 0.033 * math.sin(a))) for a in np.linspace(0, 2 * math.pi, 17)], 0.0035, STEEL, 6, cap=False))
        pieces.append(blob(at + Vector((sd * 0.036, 0, 0)), (0.004, 0.02, 0.024), RED, 4, 12))
    top_z = crown + 0.014
    arc = [Vector(((ear.x + 0.026) * math.cos(a), ear.y + 0.004 - 0.012 * math.sin(a), ear.z + 0.02 + (top_z - ear.z - 0.02) * math.sin(a))) for a in np.linspace(0, math.pi, 21)]
    pieces.append(tube(arc, 0.011, BLACK, 8, flat=0.35))
    pieces.append(tube(arc[5:16], 0.0125, DARK, 8, flat=0.5))          # (the pad under the middle of it)
    phones = gather('Headphones', pieces)
    plain(phones, 'Headphones', paint=True, rough=0.5)
    bind(phones, {'head': 1.0})
    made.append((phones, 'Headphones'))

    # Glasses: a thin black frame, arms back to his ears, and two amber lenses (a piece of their own: they are clear).
    pieces, lenses = [], []
    for sd in (-1, 1):
        c = Vector((sd * eye.x * 1.04, eye.y - 0.016, eye.z + 0.002))
        oval = [c + Vector((0.029 * math.cos(a), 0.005 * max(0.0, sd * math.cos(a)) ** 2, 0.0195 * math.sin(a))) for a in np.linspace(0, 2 * math.pi, 25)]     # (wrapped back a little at its outer end)
        pieces.append(tube(oval, 0.002, BLACK, 6, cap=False))
        lenses.append(blob(c + Vector((0, 0.001, 0)), (0.0285, 0.0012, 0.0195), AMBER, 4, 20))
        hinge = c + Vector((sd * 0.03, 0.006, 0.004))
        pieces.append(tube([hinge, Vector((sd * (ear.x - 0.004), ear.y - 0.03, ear.z + 0.022)), Vector((sd * (ear.x - 0.002), ear.y + 0.012, ear.z + 0.012))], 0.0019, BLACK, 6))
    pieces.append(tube([Vector((-eye.x * 1.04 + 0.027, eye.y - 0.018, eye.z + 0.006)), Vector((0, eye.y - 0.022, eye.z + 0.009)), Vector((eye.x * 1.04 - 0.027, eye.y - 0.018, eye.z + 0.006))], 0.002, BLACK, 6))
    glasses = gather('Glasses', pieces)
    plain(glasses, 'Glasses', paint=True, rough=0.35)
    bind(glasses, {'head': 1.0})
    lens = gather('Lenses', lenses)
    plain(lens, 'Lenses', paint=True, rough=0.1)
    bind(lens, {'head': 1.0})
    made += [(glasses, 'Glasses'), (lens, 'Lenses')]

    # A backpack: blue, a red pocket on the lower half of it, a grab loop on top, red straps over his shoulders and
    # back under his arms. It sits against the back of his shirt (found by looking for it), and goes with his chest.
    dg = bpy.context.evaluated_depsgraph_get()
    shirt_tree = BVHTree.FromObject(shirt, dg)
    def on_shirt(p, toward, clear=0.008):
        """Where a line from `p` toward `toward` meets his shirt, stood a little off it."""
        d = (Vector(toward) - Vector(p)).normalized()
        hit = shirt_tree.ray_cast(Vector(p), d, 2.0)
        return (hit[0] - d * clear) if hit[0] is not None else Vector(toward)
    mid_z = chest.z + 0.1
    back = on_shirt((0, 0.6, mid_z), (0, waist.y, mid_z), 0.0)
    pw, ph, pd = 0.135, 0.19, 0.062
    pc = Vector((0, back.y + pd * 0.92, mid_z - 0.015))
    bulge = lambda v: Vector((v.x * (1 - 0.12 * max(0, v.z)), v.y * (1 - 0.25 * max(0, v.z) ** 2) if v.y > 0 else v.y * 0.7, v.z))
    pieces = [blob(pc, (pw, pd, ph), BLUE, 12, 20, bulge)]
    pieces.append(blob(pc + Vector((0, pd * 0.72, -ph * 0.36)), (pw * 0.8, pd * 0.62, ph * 0.5), RED, 10, 18, lambda v: Vector((v.x, v.y if v.y > 0 else v.y * 0.3, v.z))))
    pieces.append(tube([pc + Vector((pw * 0.86 * math.cos(a), pd * 0.55 + 0.004, ph * 0.3 + ph * 0.62 * math.sin(a) * 0.9)) for a in np.linspace(0.15, math.pi - 0.15, 15)], 0.0035, NAVY, 5))       # the zip round the top of it
    pieces.append(tube([pc + Vector((pw * 0.66 * math.cos(a), pd * 1.3, -ph * 0.36 + ph * 0.36 * math.sin(a))) for a in np.linspace(0.2, math.pi - 0.2, 13)], 0.003, DARK, 5))                       # ...and the pocket's
    pieces.append(tube([pc + Vector((0.03 * math.cos(a), -pd * 0.2, ph * 0.93 + 0.035 * math.sin(a))) for a in np.linspace(0, math.pi, 9)], 0.006, NAVY, 6, flat=0.5))                                # the loop it hangs by
    for sd in (-1, 1):
        sx = sd * 0.108
        line = []
        # over his shoulder, from the top of the pack to the front of his chest...
        for a in np.linspace(-0.25, math.pi + 0.5, 15):
            p = Vector((sx, waist.y + 0.5 * math.cos(a), chest.z + 0.16 + 0.5 * math.sin(a)))
            line.append(on_shirt(p, (sx, waist.y, chest.z + 0.16), 0.007))
        # ...and round under his arm to the bottom of it
        low = line[-1].z
        for a in np.linspace(-math.pi / 2 + 0.35, math.pi / 2 - 0.15, 9)[1:]:
            z = low - 0.05 - 0.07 * (a + math.pi / 2) / math.pi
            p = Vector((sd * (0.02 + 0.5 * math.cos(a)), waist.y + 0.5 * math.sin(a), z))
            line.append(on_shirt(p, (sd * 0.02, waist.y, z), 0.007))
        line[0] = pc + Vector((sx * 0.8, -pd * 0.3, ph * 0.8))
        line.append(pc + Vector((sd * pw * 0.8, -pd * 0.1, -ph * 0.75)))
        pieces.append(tube(line, 0.0155, RED, 8, flat=0.24))
    pack = gather('Pack', pieces)
    plain(pack, 'Pack', paint=True, rough=0.8)
    bind(pack, {'spine_03': 1.0})
    made.append((pack, 'Pack'))

    # ---- His head, a piece of its own (a costume's head goes in place of it) ----
    dom = dominant(body)
    face = split_off(body, lambda poly: sum(dom[v] == 'head' for v in poly.vertices) * 2 > len(poly.vertices), 'Face')
    body.name = 'Body'
    plain(body, 'Body', image=skin, rough=0.7)
    if face:
        plain(face, 'Face', image=skin, rough=0.7)
        made.append((face, 'Face'))
    made.append((body, 'Body'))

    # ---- Out ----
    for o, name in made:
        o.name = name
        o.data.name = name
        if not any(m.type == 'ARMATURE' for m in o.modifiers):
            o.modifiers.new('Armature', 'ARMATURE').object = rig
        o.parent = rig
    for image in bpy.data.images:
        if image.size[0] > TEXTURE:
            image.scale(TEXTURE, TEXTURE)
    used = {picture(o) for o, _ in made}
    for image in list(bpy.data.images):
        if image not in used and image.users == 0:
            bpy.data.images.remove(image)
    total = 0
    for o, name in made:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        total += tris
        print('MESH', name, tris, 'tris', [round(d, 3) for d in o.dimensions])
    print('TOTAL', total)
    for name in ('pelvis', 'spine_01', 'spine_03', 'neck_01', 'head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'thigh_l', 'calf_l', 'foot_l', 'ball_l'):
        b = rig.data.bones[name]
        print('BONE', name, [round(v, 4) for v in (rig.matrix_world @ b.head_local)], [round(v, 4) for v in (rig.matrix_world @ b.tail_local)])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    for o in bpy.data.objects:
        o.select_set(o is rig or any(o is m for m, _ in made))
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=88, export_animations=False, export_skins=True, export_yup=True)
    print('EXPORTED', OUT, os.path.getsize(OUT))

    if PREVIEW:
        # (as the game will show him: the shirt dyed black)
        for o, name in made:
            if name == 'Shirt':
                tree = o.data.materials[0].node_tree
                shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
                tex = next(n for n in tree.nodes if n.type == 'TEX_IMAGE')
                mix = tree.nodes.new('ShaderNodeMixRGB')
                mix.blend_type = 'MULTIPLY'
                mix.inputs[0].default_value = 1
                mix.inputs[2].default_value = (0.03, 0.03, 0.034, 1)
                tree.links.new(tex.outputs['Color'], mix.inputs[1])
                tree.links.new(mix.outputs['Color'], shader.inputs['Base Color'])
            if name == 'Logo':
                o.hide_render = True
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        scene.collection.objects.link(cam)
        scene.camera = cam
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        sun.data.energy = 3
        scene.collection.objects.link(sun)
        fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN'))
        fill.data.energy = 1.2
        scene.collection.objects.link(fill)
        world = bpy.data.worlds.new('w')
        world.use_nodes = True
        world.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.75, 0.75, 1)
        world.node_tree.nodes['Background'].inputs[1].default_value = 0.9
        scene.world = world
        head = bone('head')
        shots = [((0.0, -4.6, 1.0), (0, 0, 0.88)), ((0.0, 4.6, 1.0), (0, 0, 0.88)), ((4.6, 0.0, 1.0), (0, 0, 0.88)), ((2.6, -3.6, 1.4), (0, 0, 0.88)),
                 ((0.18, -0.95, head.z + 0.1), (0, 0, head.z + 0.07)), ((0.9, 0.5, head.z + 0.12), (0, 0, head.z + 0.07)), ((1.2, -0.9, 0.4), (0.1, -0.05, 0.1))]
        try:
            scene.render.engine = 'BLENDER_EEVEE_NEXT'
        except Exception:
            scene.render.engine = 'BLENDER_EEVEE'
        scene.render.resolution_x, scene.render.resolution_y = 640, 900
        for i, (eye_at, look) in enumerate(shots):
            cam.location = eye_at
            cam.rotation_euler = (Vector(look) - Vector(eye_at)).to_track_quat('-Z', 'Y').to_euler()
            sun.rotation_euler = (Vector(look) - Vector(eye_at) + Vector((0.4, 0, -0.5))).to_track_quat('-Z', 'Y').to_euler()
            fill.rotation_euler = (Vector(look) - Vector(eye_at) + Vector((-0.8, 0, 0.3))).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = PREVIEW.replace('.png', f'_{i}.png')
            try:
                bpy.ops.render.render(write_still=True)
                print('RENDERED', scene.render.filepath)
            except Exception:
                traceback.print_exc()


try:
    main()
except Exception:
    traceback.print_exc()
