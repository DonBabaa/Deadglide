# Builds Kirky's body: a MakeHuman character (the MPFB add-on for Blender), dressed, on a game skeleton, exported
# as public/models/kirky.glb for the game to load (src/player/kirkyBody.js).
#
# Run it from the repo:
#   blender --background --python tools/build_kirky.py -- public/models/kirky.glb [preview.png]
#
# It needs, in Blender: the MPFB extension (extensions.blender.org), and these MakeHuman Community asset packs
# installed in it: "MakeHuman system assets" (CC0), "Shirts 01" (CC0), "Pants 01" (CC0) and "Shoes 02" (CC-BY).
# What it uses from them, and whose work it is:
#   body, skin, eyes, eyebrows, teeth, hair   MakeHuman system assets (CC0)
#   elvs_crude_t-shirt_male                   MakeHuman, edited by Elvaerwyn (CC0)
#   toigo_wool_pants                          MRT (CC0)
#   elvs_zombie_killer_sneakers               Elvaerwyn (CC-BY)
import bpy, sys, os, math, traceback

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0])
PREVIEW = os.path.abspath(args[1]) if len(args) > 1 else None
TEXTURE = 1024   # the longest side of any texture, in pixels
BUDGET = {'sneakers': 30000, 'teeth': 1500}   # triangles: these come far heavier than a game wants


def recolour(image, grey=False, gain=1.0, lift=0.0):
    """Repaint a texture: to shades of grey (so the game can dye it any colour), and/or brighter."""
    import numpy as np
    px = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
    rgb = px[:, :3]
    if grey:
        lum = rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
        base = float(np.median(lum))                                  # the cloth itself (it comes almost black)...
        lum = 0.76 + np.clip((lum - base) * 4.0, -0.3, 0.24)          # ...becomes a light grey, with its weave and seams kept
        rgb = np.repeat(lum[:, None], 3, axis=1)
    px[:, :3] = np.clip(rgb * gain + lift, 0, 1)
    image.pixels[:] = px.ravel()
    image.update()

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService

DATA = LocationService.get_user_data()
asset = lambda *parts: os.path.join(DATA, *parts)


def simplify(material):
    """One plain material in place of MakeHuman's: its colour picture, its bumps, nothing else (that is what exports)."""
    if not material or not material.use_nodes:
        return
    images = [n.image for n in material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
    colour = next((i for i in images if not any(k in i.name.lower() for k in ('norm', '_ao', 'bump', 'spec', 'rough'))), None)
    bumps = next((i for i in images if 'norm' in i.name.lower()), None)
    tree = material.node_tree
    tree.nodes.clear()
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    shader = tree.nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Roughness'].default_value = 0.85
    tree.links.new(shader.outputs['BSDF'], out.inputs['Surface'])
    if colour:
        tex = tree.nodes.new('ShaderNodeTexImage')
        tex.image = colour
        tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
        if colour.depth == 32 and any(k in material.name.lower() for k in ('brow', 'lash', 'hair', 'long01')):
            tree.links.new(tex.outputs['Alpha'], shader.inputs['Alpha'])
            material.blend_method = 'BLEND' if hasattr(material, 'blend_method') else material.blend_method
    if bumps:
        bumps.colorspace_settings.name = 'Non-Color'
        tex = tree.nodes.new('ShaderNodeTexImage')
        tex.image = bumps
        nm = tree.nodes.new('ShaderNodeNormalMap')
        tree.links.new(tex.outputs['Color'], nm.inputs['Color'])
        tree.links.new(nm.outputs['Normal'], shader.inputs['Normal'])


def world_points(o):
    import numpy as np
    pts = np.empty(len(o.data.vertices) * 3, dtype=np.float64)
    o.data.vertices.foreach_get('co', pts)
    pts = pts.reshape(-1, 3)
    m = np.array(o.matrix_world)
    return pts @ m[:3, :3].T + m[:3, 3]


def set_world_points(o, pts):
    import numpy as np
    m = np.array(o.matrix_world.inverted())
    local = pts @ m[:3, :3].T + m[:3, 3]
    o.data.vertices.foreach_set('co', local.ravel())
    o.data.update()


def paint3d(o, image, fn):
    """Paint on a mesh's texture by where things are on the mesh itself: fn(points, normals) is given every pixel's
    place on the model (N x 3, in metres) and which way the surface faces there, and gives back (which pixels, colours)."""
    import numpy as np
    W, H = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(H, W, 4)
    mesh = o.data
    mesh.calc_loop_triangles()
    pts = world_points(o)
    uv = mesh.uv_layers.active.data
    rot = np.array(o.matrix_world)[:3, :3]
    done = 0
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
        hit, colour = fn(where, np.repeat(normal[None, :], len(where), 0))
        if hit is None or not hit.any():
            continue
        ys, xs = np.nonzero(inside)
        px[ys[hit] + y0, xs[hit] + x0, :3] = colour[hit] if getattr(colour, 'ndim', 1) == 2 else colour
        done += int(hit.sum())
    image.pixels[:] = px.ravel()
    image.update()
    return done


def only(o):
    for ob in bpy.data.objects:
        ob.select_set(ob is o)
    bpy.context.view_layer.objects.active = o


def split_off(o, pick, name):
    """The faces `pick` says yes to (it is given a face's middle and its normal, in the world) become an object of their own."""
    only(o)
    mw = o.matrix_world
    rot = mw.to_3x3()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    n = 0
    for poly in o.data.polygons:
        poly.select = bool(pick(mw @ poly.center, rot @ poly.normal))
        n += poly.select
    if not n:
        return None
    before = set(bpy.data.objects)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    new = next(iter(set(bpy.data.objects) - before), None)
    if new:
        new.name = name
    return new


def main():
    import numpy as np, bmesh
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # A young man: lean, average height.
    macro = TargetService.get_default_macro_info_dict()
    macro.update({'gender': 1.0, 'age': 0.5, 'muscle': 0.55, 'weight': 0.4, 'height': 0.55, 'proportions': 0.7})
    macro['race'] = {'asian': 0.2, 'caucasian': 0.5, 'african': 0.3}
    body = HumanService.create_human(scale=0.1, macro_detail_dict=macro)
    # His face: stoned. Heavy lids, half shut, with bags under them; eyebrows slack and a little up in the middle;
    # a slow half-smile. Nothing else about it is pushed: it is an ordinary, good-looking face.
    SYSTEM = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(sys.modules[HumanService.__module__].__file__))), 'data', 'targets')
    U = 'expression/units/caucasian/'
    FACE = {
        'head/head-round': 0.2, 'cheek/l-cheek-volume-incr': 0.15, 'cheek/r-cheek-volume-incr': 0.15,
        'ears/l-ear-wing-incr': 0.2, 'ears/r-ear-wing-incr': 0.2,
        'nose/nose-volume-incr': 0.25, 'nose/nose-scale-horiz-incr': 0.15,
        U + 'eye-left-closure': 0.3, U + 'eye-right-closure': 0.3, U + 'eye-left-slit': 0.1, U + 'eye-right-slit': 0.1,
        'eyes/l-eye-bag-incr': 0.9, 'eyes/r-eye-bag-incr': 0.9, 'eyes/l-eye-eyefold-down': 0.5, 'eyes/r-eye-eyefold-down': 0.5,
        U + 'eyebrows-left-inner-up': 0.4, U + 'eyebrows-right-inner-up': 0.4,
        U + 'mouth-corner-puller': 0.35, 'mouth/mouth-angles-up': 0.3, 'mouth/mouth-lowerlip-volume-incr': 0.3,
    }
    for name, weight in FACE.items():
        path = os.path.join(SYSTEM, *name.split('/')) + '.target.gz'
        if not os.path.exists(path):
            print('NO TARGET', name)
            continue
        try:
            TargetService.load_target(body, path, weight=weight)
        except Exception:
            print('TARGET FAILED', name)
            traceback.print_exc()
    HumanService.add_builtin_rig(body, 'game_engine')
    rig = body.parent
    HumanService.set_character_skin(asset('skins', 'young_caucasian_male', 'young_caucasian_male.mhmat'), body, skin_type='GAMEENGINE')
    wear = [
        ('Eyes', asset('eyes', 'low-poly', 'low-poly.mhclo')),
        ('Eyebrows', asset('eyebrows', 'eyebrow001', 'eyebrow001.mhclo')),
        ('Teeth', asset('teeth', 'teeth_base', 'teeth_base.mhclo')),
        ('Hair', asset('hair', 'long01', 'long01.mhclo')),
        ('Clothes', asset('clothes', 'elvs_crude_t-shirt_male', 'elvs_crude_t-shirt_male.mhclo')),
        ('Clothes', asset('clothes', 'toigo_wool_pants', 'toigo_wool_pants.mhclo')),
        ('Clothes', asset('clothes', 'elvs_zombie_killer_sneakers', 'elvs_zombie_killer_sneakers.mhclo')),   # (lace-up skate shoes)
    ]
    for kind, path in wear:
        if not os.path.exists(path):
            print('MISSING', path)
            continue
        try:
            HumanService.add_mhclo_asset(path, body, asset_type=kind, subdiv_levels=0, material_type='MAKESKIN')
        except Exception:
            print('FAILED', path)
            traceback.print_exc()
    print('OBJECTS', [o.name for o in bpy.data.objects])
    kind_of = lambda o: next((n for k, n in (('face', 'Face'), ('shirt', 'Shirt'), ('pants', 'Pants'), ('sneakers', 'Shoes'), ('eyebrow', 'Brows'), ('low-poly', 'Eyes'), ('teeth', 'Teeth'), ('long01', 'Hair')) if k in o.name.lower()), 'Body')
    bone = lambda name: rig.matrix_world @ rig.data.bones[name].head_local

    # Skin that is under his clothes is cut away (it would only poke through them when he moves). A point of him is
    # under them if, looking straight out from it, there is cloth within a few centimetres; a face goes when all of it is.
    cloth = [o for o in bpy.data.objects if o.type == 'MESH' and kind_of(o) in ('Shirt', 'Pants', 'Shoes')]
    trees = []
    deps = bpy.context.evaluated_depsgraph_get()
    for o in cloth:
        ev = o.evaluated_get(deps)
        mesh = ev.to_mesh()
        mw = o.matrix_world
        trees.append(BVHTree.FromPolygons([mw @ v.co for v in mesh.vertices], [tuple(p.vertices) for p in mesh.polygons]))
        ev.to_mesh_clear()
    mw, rot = body.matrix_world, body.matrix_world.to_3x3()
    hidden, kept = set(), set()
    COLLAR = bone('neck_01').z - 0.22
    for vert in body.data.vertices:
        at, out = mw @ vert.co, (rot @ vert.normal).normalized()
        if any(t.ray_cast(at + out * 0.0005, out, 0.05)[0] is not None for t in trees):
            hidden.add(vert.index)
            if at.z > COLLAR and abs(at.x) < 0.27:
                kept.add(vert.index)                   # (round his collar the skin stays, drawn in under the cloth: the shirt's neck is wide and moves)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    # Only what is well inside goes (a point in from where the cloth ends); the band of skin left under the
    # cloth's edge is drawn in a little, so that it lies under the cloth and not through it.
    deep = hidden - kept
    for _ in range(0):
        deep = {i for i in deep if all(e.other_vert(bm.verts[i]).index in deep for e in bm.verts[i].link_edges)}
    scale = body.matrix_world.to_scale().x
    for i in hidden:
        v = bm.verts[i]
        v.co -= v.normal * (0.014 / scale)
    gone = [f for f in bm.faces if all(v.index in deep for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    print('CUT', len(gone), 'faces of the body under his clothes')

    # His head comes off as a piece of its own (a costume's head takes its place).
    groups = {g.index: g.name for g in body.vertex_groups}
    only(body)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='VERT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for vert in body.data.vertices:
        best = max((g for g in vert.groups if groups.get(g.group) in rig.data.bones), key=lambda g: g.weight, default=None)
        vert.select = bool(best) and groups[best.group] == 'head'
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.selected_objects:
        if o is not body:
            o.name = 'Human.face'

    # Make it final: the shape it has been given, no modifiers left but the skeleton.
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in meshes:
        only(o)
        kind = kind_of(o)
        if o.data.shape_keys:
            bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
        if kind in ('Shirt', 'Pants'):                      # (they come coarse: rounded off once)
            sub = o.modifiers.new('round', 'SUBSURF')
            sub.levels = 1
        for mod in list(o.modifiers):
            if mod.type == 'ARMATURE':
                continue
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception:
                o.modifiers.remove(mod)
        # How each point follows the bones: evened out on his clothes, and no point following more than four bones.
        try:
            if kind == 'Pants':                              # (the shirt keeps the body's own: smoothed, his shoulders come through it)
                bpy.ops.object.mode_set(mode='EDIT')
                bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=4, expand=0.0)
                bpy.ops.object.mode_set(mode='OBJECT')
            bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
            bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
        except Exception:
            traceback.print_exc()
            if bpy.context.object and bpy.context.object.mode != 'OBJECT':
                bpy.ops.object.mode_set(mode='OBJECT')
        # A turn of his head stops at his collar: below it, what would go with his neck goes with his chest (or his
        # collarbones are wrung round with his head, out through the neck of his shirt).
        if kind in ('Body', 'Shirt') and 'neck_01' in o.vertex_groups and 'spine_03' in o.vertex_groups:
            neck, chest, base = o.vertex_groups['neck_01'], o.vertex_groups['spine_03'], bone('neck_01').z
            for vert in o.data.vertices:
                z = (o.matrix_world @ vert.co).z
                share = min(1.0, max(0.0, (base + 0.01 - z) / 0.05))
                if share <= 0:
                    continue
                w = next((g.weight for g in vert.groups if g.group == neck.index), 0.0)
                if w > 0:
                    neck.add([vert.index], w * (1 - share), 'REPLACE')
                    chest.add([vert.index], w * share, 'ADD')
        for key, budget in BUDGET.items():                 # thin out the ones that are too heavy
            tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
            if key in o.name and tris > budget:
                mod = o.modifiers.new('thin', 'DECIMATE')
                mod.ratio = budget / tris
                bpy.ops.object.modifier_apply(modifier=mod.name)
        for slot in o.material_slots:
            simplify(slot.material)
        o.name = kind                                       # named for what they are, so the game can find them
        for slot in o.material_slots:
            if slot.material:
                slot.material.name = o.name
    named = {o.name: o for o in meshes}
    for image in bpy.data.images:
        if image.size[0] > TEXTURE or image.size[1] > TEXTURE:
            k = TEXTURE / max(image.size)
            image.scale(max(1, int(image.size[0] * k)), max(1, int(image.size[1] * k)))
    picture = lambda o: next((n.image for n in o.material_slots[0].material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and 'norm' not in n.image.name.lower()), None)

    # ---- Baggy trousers ----
    # Cut straight and wide from the hip down (they come close-fitting), stacked in folds over his shoes, and turned
    # up at the hem: the turn-up stands out from the leg and shows the paler inside of the cloth.
    pants = named.get('Pants')
    if pants:
        pts = world_points(pants)
        hip, knee, foot = bone('thigh_l'), bone('calf_l'), bone('foot_l')
        hem = float(pts[:, 2].min())
        CUFF = 0.05
        for i, (x, y, z) in enumerate(pts):
            if z >= hip.z:
                continue
            side = 1.0 if x >= 0 else -1.0
            t = (hip.z - z) / (hip.z - foot.z)
            cx = side * abs(hip.x + (foot.x - hip.x) * t)
            cy = hip.y + (knee.y - hip.y) * min(1.0, t * 2) if t < 0.5 else knee.y + (foot.y - knee.y) * (t * 2 - 1)
            k = min(1.0, (hip.z - z) / (hip.z - knee.z))
            wide = 1.0 + 0.5 * k * k * (3 - 2 * k)
            dx, dy = (x - cx) * wide, (y - cy) * wide
            r = math.hypot(dx, dy) or 1e-6
            ang = math.atan2(dy, dx)
            low = max(0.0, min(1.0, (knee.z - z) / (knee.z - hem)))
            r += 0.007 * low * math.sin(z * 55 + 2.0 * math.sin(ang * 2 + side) + 1.3 * math.sin(z * 17))     # the cloth stacking up on itself
            if z < hem + CUFF:
                r += 0.008
            nx = cx + dx / math.hypot(dx, dy) * r if (dx or dy) else x
            ny = cy + dy / math.hypot(dx, dy) * r if (dx or dy) else y
            if side * nx < 0.006:
                nx = side * 0.006                       # (the legs do not run into each other)
            pts[i] = (nx, ny, z)
        set_world_points(pants, pts)
        image = picture(pants)
        if image:
            px = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
            lum = px[:, :3] @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
            shade = 1.0 + np.clip((lum - float(np.median(lum))) * 2.5, -0.35, 0.2)
            px[:, :3] = np.clip(shade[:, None] * np.array([0.60, 0.50, 0.33], dtype=np.float32), 0, 1)      # khaki
            image.pixels[:] = px.ravel()
            def cuff(P, N):
                h = P[:, 2] - hem
                colour = np.tile(np.array([0.72, 0.63, 0.45], dtype=np.float32), (len(P), 1))
                colour[(h > CUFF - 0.006)] = (0.36, 0.30, 0.19)             # the shadow under the turn-up's edge
                colour[(h < 0.005)] = (0.5, 0.42, 0.28)
                return h < CUFF, colour
            print('CUFF', paint3d(pants, image, cuff), 'pixels')

    # ---- His T-shirt ----
    # Worn loose and long, out over his trousers (it comes short and close, as if tucked in).
    shirt = named.get('Shirt')
    if shirt:
        pts = world_points(shirt)
        WAIST = bone('spine_03').z - 0.02
        mid = bone('spine_01')
        for i, (x, y, z) in enumerate(pts):
            if z < WAIST and abs(x) < 0.24:
                d = WAIST - z
                t = min(1.0, d / 0.16)
                loose = 1.0 + 0.2 * t
                pts[i] = (x * loose, mid.y + (y - mid.y) * (loose + 0.06 * t), WAIST - d * 1.75 + 0.006 * t * math.sin(math.atan2(y - mid.y, x) * 5))
        set_world_points(shirt, pts)
        for vert in shirt.data.vertices:               # (and standing a little off him everywhere: it is a size too big)
            vert.co += vert.normal * (0.006 / shirt.matrix_world.to_scale().x)
        print('SHIRT hem at', round(float(pts[:, 2].min()), 3))

    # ---- Long hair ----
    # To his shoulders (it comes down to the small of his back), fuller at the sides. What is above the rim of his
    # beanie is a piece of its own, so that the game can leave it off when the beanie is on.
    hair, face = named.get('Hair'), named.get('Face')
    if hair and face:
        crown = float(world_points(face)[:, 2].max())
        ear = crown - 0.15
        pts = world_points(hair)
        for i, (x, y, z) in enumerate(pts):
            if z < ear:
                d = ear - z
                pts[i] = (x * (1 + min(d, 0.25) * 0.2), y + min(d, 0.3) * 0.04, ear - d * 0.34)
        set_world_points(hair, pts)
        # It goes with his head (he rides side-on, looking over his shoulder: it has to turn with him), its ends
        # dragging a little on his shoulders.
        for name in ('head', 'spine_03'):
            if name not in hair.vertex_groups:
                hair.vertex_groups.new(name=name)
        for i, (x, y, z) in enumerate(pts):
            if z < ear:
                t = min(1.0, (ear - z) / 0.17) * 0.2
                for g in hair.vertex_groups:
                    g.remove([i])
                hair.vertex_groups['head'].add([i], 1 - t, 'REPLACE')
                hair.vertex_groups['spine_03'].add([i], t, 'REPLACE')
        image = picture(hair)
        if image:                                          # dark brown, tips and all (it comes auburn, with bleached ends)
            px = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
            px[:, :3] = np.clip(px[:, :3] * np.array([0.5, 0.52, 0.56], dtype=np.float32), 0, 0.3)
            image.pixels[:] = px.ravel()
        RIM = crown - 0.10
        bm = bmesh.new()
        bm.from_mesh(hair.data)
        inv = hair.matrix_world.inverted()
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=inv @ Vector((0, 0, RIM)), plane_no=(inv.to_3x3().transposed().inverted() @ Vector((0, 0, 1))).normalized())
        bm.to_mesh(hair.data)
        bm.free()
        top = split_off(hair, lambda c, n: c.z > RIM, 'HairTop')
        if top:
            meshes.append(top)
        print('HAIR crown', round(crown, 3), 'rim', round(RIM, 3), 'ends', round(float(world_points(hair)[:, 2].min()), 3))

    # ---- The print on his chest ----
    # A patch of the shirt's front, lifted a hair off it, for the game to draw its flame logo on (so the shirt under
    # it can still be dyed any colour).
    if shirt:
        chest = bone('spine_03')
        Z0, Z1, HALF = chest.z - 0.02, chest.z + 0.16, 0.15
        only(shirt)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')
        mw, rot = shirt.matrix_world, shirt.matrix_world.to_3x3()
        for poly in shirt.data.polygons:
            c, n = mw @ poly.center, rot @ poly.normal
            poly.select = n.y < -0.3 and c.y < 0 and Z0 - 0.03 < c.z < Z1 + 0.03 and abs(c.x) < HALF + 0.03
        before = set(bpy.data.objects)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.duplicate()
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        logo = next(iter(set(bpy.data.objects) - before), None)
        if logo:
            logo.name = 'Logo'
            mat = bpy.data.materials.new('Logo')
            mat.use_nodes = True
            logo.data.materials.clear()
            logo.data.materials.append(mat)
            layer = logo.data.uv_layers.active
            for loop in logo.data.loops:
                p = logo.matrix_world @ logo.data.vertices[loop.vertex_index].co
                layer.data[loop.index].uv = ((p.x + HALF) / (2 * HALF), (p.z - Z0) / (Z1 - Z0))
            for vert in logo.data.vertices:
                vert.co += vert.normal * (0.0025 / logo.matrix_world.to_scale().x)
            meshes.append(logo)
            print('LOGO', len(logo.data.polygons), 'faces, from', round(Z0, 3), 'to', round(Z1, 3))

    # ---- Colours ----
    shoes = named.get('Shoes')
    if shoes and picture(shoes):
        # Black canvas and laces on white rubber.
        image = picture(shoes)
        px = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
        rgb = px[:, :3]
        hi, lo = rgb.max(1), rgb.min(1)
        coloured = (hi - lo) > 0.18 * np.maximum(hi, 0.05)
        lum = rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
        rgb[coloured] = (0.035 + 0.05 * lum[coloured])[:, None]
        rgb[~coloured] = np.clip(rgb[~coloured] * 1.08 + 0.04, 0, 1)
        image.pixels[:] = px.ravel()
        pts = world_points(shoes)
        print('SHOES x', pts[:, 0].min(), pts[:, 0].max(), 'y', pts[:, 1].min(), pts[:, 1].max(), 'z', pts[:, 2].min(), pts[:, 2].max())
        # The stripe down each side: a white wave from the heel, up and over to the laces.
        left = pts[pts[:, 0] > 0]
        mid = float((left[:, 0].min() + left[:, 0].max()) / 2)
        back, front, sole, topz = float(pts[:, 1].max()), float(pts[:, 1].min()), float(pts[:, 2].min()), float(pts[:, 2].max())
        length = back - front
        def stripe(P, N):
            f = (back - P[:, 1]) / length                          # 0 at the heel, 1 at the toe
            h = P[:, 2] - sole
            line = 0.05 - 0.018 * np.cos((f - 0.12) / 0.5 * np.pi) + 0.035 * np.clip((f - 0.42) / 0.2, 0, 1)
            sideways = np.abs(N[:, 0]) > 0.45
            hit = sideways & (f > 0.1) & (f < 0.62) & (np.abs(h - line) < 0.0065)
            return hit, np.array([0.93, 0.93, 0.9], dtype=np.float32)
        print('STRIPE', paint3d(shoes, image, stripe), 'pixels')
    for image in bpy.data.images:
        name = image.name.lower()
        if '_eye' in name and 'brow' not in name:
            # Bloodshot: the whites gone pink, redder towards their edges.
            W, H = image.size
            px = np.array(image.pixels[:], dtype=np.float32).reshape(H, W, 4)
            rgb = px[:, :, :3]
            white = ((rgb.max(2) - rgb.min(2)) < 0.14) & (rgb.min(2) > 0.5)
            yy, xx = np.mgrid[0:H, 0:W]
            veins = 0.5 + 0.5 * np.sin(xx * 0.21 + 3 * np.sin(yy * 0.05)) * np.sin(yy * 0.17 + 2 * np.sin(xx * 0.07))
            red = 0.5 + 0.35 * veins
            rgb[white] = rgb[white] * np.stack([np.ones_like(red), 1 - 0.55 * red, 1 - 0.58 * red], 2)[white]
            image.pixels[:] = px.ravel()
            print('EYES', int(white.sum()), 'pixels reddened in', image.name)

    # What came out.
    total = 0
    for o in meshes:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        total += tris
        print('MESH', o.name, tris, 'tris', [s.material.name if s.material else None for s in o.material_slots], [round(d, 3) for d in o.dimensions])
    print('TOTAL', total)
    for name in ('pelvis', 'spine_01', 'spine_03', 'neck_01', 'head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'thigh_l', 'calf_l', 'foot_l', 'ball_l'):
        b = rig.data.bones[name]
        print('BONE', name, [round(v, 4) for v in (rig.matrix_world @ b.head_local)], [round(v, 4) for v in (rig.matrix_world @ b.tail_local)])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85, export_animations=False, export_skins=True, export_yup=True)
    print('EXPORTED', OUT, os.path.getsize(OUT))

    if PREVIEW:
        from mathutils import Vector
        scene = bpy.context.scene
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        scene.collection.objects.link(cam)
        scene.camera = cam
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        scene.collection.objects.link(sun)
        head = rig.matrix_world @ rig.data.bones['head'].head_local
        shots = [((1.6, -4.2, 1.2), (0, 0, 0.9)), ((-2.2, 3.8, 1.2), (0, 0, 0.9)), ((4.4, 0.1, 1.0), (0, 0, 0.9)),
                 ((0.25, -1.1, head.z + 0.1), (0, 0, head.z + 0.08)), ((1.3, -0.9, 0.35), (0.1, -0.05, 0.08))]
        for i, (eye, look) in enumerate(shots):
            cam.location = eye
            cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
            sun.rotation_euler = cam.rotation_euler
            scene.render.resolution_x, scene.render.resolution_y = 700, 900
            scene.render.filepath = PREVIEW.replace('.png', f'_{i}.png')
            try:
                scene.render.engine = 'BLENDER_WORKBENCH'
                scene.display.shading.light = 'STUDIO'
                scene.display.shading.color_type = 'TEXTURE'
                bpy.ops.render.render(write_still=True)
                print('RENDERED', scene.render.filepath)
            except Exception:
                traceback.print_exc()

try:
    main()
except Exception:
    traceback.print_exc()
