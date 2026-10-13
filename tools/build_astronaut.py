# Builds the space suit Kirky wears as the Dead Astronaut, the Cosmonaut and the Golden Boy (and that stands about
# the Moon as a Free Ride target): public/models/astronaut.glb.
#
#   blender --background --python tools/build_astronaut.py -- public/models/astronaut.glb [preview.png]
#
# A MakeHuman body on Kirky's own skeleton (so the game poses it bone for bone from his: src/player/kirkyBody.js),
# blown up into a pressure suit: thick quilted limbs with ribbed joints and locking rings, gauntlets, heavy boots, a
# chest pack of controls, a life-support pack on its back with its hoses, and a bubble of a helmet on a neck ring.
# Three meshes: Suit (its cloth: the game gives it its colour), Trim (rings, packs, hoses, soles: the game colours
# those too), Visor. Shading is baked onto the points. Uses only the MakeHuman base mesh (CC0).
import bpy, sys, os, math, traceback
import numpy as np
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0])
PREVIEW = os.path.abspath(args[1]) if len(args) > 1 else None

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService


def only(o):
    for ob in bpy.data.objects:
        ob.select_set(ob is o)
    bpy.context.view_layer.objects.active = o


def noise(P, f, seed=0.0):
    x, y, z = P[:, 0] * f + seed, P[:, 1] * f + seed * 1.7, P[:, 2] * f - seed
    return (np.sin(x + 1.3 * np.sin(y * 1.7 + z)) + np.sin(y * 1.3 + 1.1 * np.sin(z * 1.9 + x)) + np.sin(z * 1.1 + 1.2 * np.sin(x * 1.5 + y))) / 6 + 0.5


def shade(o, base=1.0, extra=None):
    """Bake light and wear onto a mesh's points (a grey: the game multiplies its colour in)."""
    mesh = o.data
    n = len(mesh.vertices)
    co = np.empty(n * 3); mesh.vertices.foreach_get('co', co); P = co.reshape(-1, 3)
    no = np.empty(n * 3); mesh.vertices.foreach_get('normal', no); N = no.reshape(-1, 3)
    s = base * (0.72 + 0.22 * np.clip(N[:, 2] * 0.7 - N[:, 1] * 0.5, -1, 1)) * (0.9 + 0.2 * noise(P, 30, 2.0))
    s *= 1 - 0.3 * np.clip((noise(P, 6, 5.0) - 0.62) * 5, 0, 1)                    # scuffs and dust
    if extra is not None:
        s = extra(P, N, s)
    which = np.empty(len(mesh.loops), dtype=np.int32); mesh.loops.foreach_get('vertex_index', which)
    col = np.clip(np.stack([s, s, s], 1), 0, 1) ** 2.2
    for a in list(mesh.color_attributes):
        mesh.color_attributes.remove(a)
    layer = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    layer.data.foreach_set('color', np.concatenate([col[which], np.ones((len(which), 1))], 1).ravel())
    mesh.color_attributes.active_color = layer


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TargetService.get_default_macro_info_dict()
    macro.update({'gender': 1.0, 'age': 0.5, 'muscle': 0.72, 'weight': 0.4, 'height': 0.55, 'proportions': 0.7})   # (Kirky's own build: the suit goes on his skeleton)
    macro['race'] = {'asian': 0.2, 'caucasian': 0.5, 'african': 0.3}
    body = HumanService.create_human(scale=0.1, macro_detail_dict=macro)
    HumanService.add_builtin_rig(body, 'game_engine')
    rig = body.parent
    only(body)
    if body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for mod in list(body.modifiers):
        if mod.type == 'ARMATURE':
            continue
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            body.modifiers.remove(mod)
    mesh = body.data
    n = len(mesh.vertices)
    groups = {g.index: g.name for g in body.vertex_groups}
    bones = set(b.name for b in rig.data.bones)
    dom = []
    for v in mesh.vertices:
        best = max((g for g in v.groups if groups.get(g.group) in bones), key=lambda g: g.weight, default=None)
        dom.append(groups[best.group] if best else '')
    dom = np.array(dom)
    head = np.char.startswith(dom, 'head')
    hand = np.array([d.startswith(('hand', 'index', 'middle', 'ring', 'pinky', 'thumb')) for d in dom])
    foot = np.array([d.startswith(('foot', 'ball')) for d in dom])
    mw = np.array(body.matrix_world); inv = np.linalg.inv(mw)
    co = np.empty(n * 3); mesh.vertices.foreach_get('co', co); P = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    no = np.empty(n * 3); mesh.vertices.foreach_get('normal', no); N = no.reshape(-1, 3)
    J = lambda name: np.array(rig.matrix_world @ rig.data.bones[name].head_local)
    # Blown up: the cloth stands well off him (less at his hands, which are in gauntlets), and is quilted in bands
    # down every limb.
    puff = np.where(hand, 0.012, np.where(foot, 0.03, 0.045))
    band = np.zeros(n)
    for a, b in (('upperarm_l', 'lowerarm_l'), ('lowerarm_l', 'hand_l'), ('upperarm_r', 'lowerarm_r'), ('lowerarm_r', 'hand_r'), ('thigh_l', 'calf_l'), ('calf_l', 'foot_l'), ('thigh_r', 'calf_r'), ('calf_r', 'foot_r')):
        A, Bn = J(a), J(b)
        axis = (Bn - A) / np.linalg.norm(Bn - A)
        t = (P - A) @ axis
        on = np.char.startswith(dom, a)
        band = np.where(on, 0.012 * np.sin(t * 2 * math.pi / 0.085), band)
    P = P + N * (puff + band)[:, None]
    sole = float(P[:, 2].min())
    P[foot, 2] = np.maximum(P[foot, 2], sole + 0.012)                           # flat, thick soles
    mesh.vertices.foreach_set('co', (P @ inv[:3, :3].T + inv[:3, 3]).ravel())
    mesh.update()
    # His own head is not in it: the helmet is.
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if head[v.index]], context='VERTS')
    bm.to_mesh(mesh)
    bm.free()
    only(body)
    bpy.ops.object.shade_smooth()
    seams = lambda P, N, s: s * (1 - 0.35 * (np.abs(P[:, 0]) < 0.006)) * np.where(P[:, 2] < sole + 0.16, 0.45, 1.0) * (1 - 0.3 * (np.abs(((P[:, 2] - 0.9) % 0.2) - 0.1) < 0.006) * (np.abs(P[:, 0]) < 0.2))
    shade(body, 1.0, seams)
    body.name = 'Suit'
    mesh.materials.clear()
    mesh.materials.append(bpy.data.materials.new('Suit'))

    made = {'Suit': [body], 'Trim': [], 'Visor': []}
    def piece(kind, bone, base=0.8):
        o = bpy.context.view_layer.objects.active
        only(o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.object.shade_smooth()
        shade(o, base)
        o.vertex_groups.new(name=bone).add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
        made[kind].append(o)
        return o
    def ring(bone, at, toward, r, thick=0.014, base=0.75):
        d = Vector(toward) - Vector(at)
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=thick, major_segments=24, minor_segments=8, location=at, rotation=d.to_track_quat('Z', 'Y').to_euler())
        return piece('Trim', bone, base)
    # Locking rings at every joint, and a ribbed bellows either side of each.
    for sd in ('l', 'r'):
        for a, b, r in ((f'lowerarm_{sd}', f'hand_{sd}', 0.085), (f'hand_{sd}', f'middle_01_{sd}', 0.062), (f'calf_{sd}', f'foot_{sd}', 0.115), (f'foot_{sd}', f'ball_{sd}', 0.0)):
            if r:
                ring(a if 'hand' not in a else f'lowerarm_{sd}', tuple(J(a)), tuple(J(b)), r)
        ring(f'upperarm_{sd}', tuple(J(f'upperarm_{sd}') * 0.85 + J(f'lowerarm_{sd}') * 0.15), tuple(J(f'lowerarm_{sd}')), 0.1)
        ring(f'thigh_{sd}', tuple(J(f'thigh_{sd}') * 0.82 + J(f'calf_{sd}') * 0.18), tuple(J(f'calf_{sd}')), 0.14)
        ring(f'calf_{sd}', tuple(J(f'calf_{sd}') * 0.15 + J(f'foot_{sd}') * 0.85), tuple(J(f'foot_{sd}')), 0.098, 0.02)
    waist = J('spine_01')
    ring('pelvis', tuple(waist), tuple(waist + [0, 0, 1]), 0.2, 0.022)
    made['Trim'][-1].data.transform(Matrix.Translation(Vector(waist)) @ Matrix.Scale(0.78, 4, (0, 1, 0)) @ Matrix.Translation(-Vector(waist)))
    # The helmet: a neck ring, a shell, and the visor let into the front of it.
    H, top = J('head'), np.array(rig.matrix_world @ rig.data.bones['head'].tail_local)
    c = Vector((H[0], H[1] - 0.012, H[2] + 0.115))
    ring('spine_03', (c.x, c.y + 0.01, H[2] - 0.035), (c.x, c.y + 0.01, H[2] + 1), 0.135, 0.022, 0.7)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.178, segments=36, ring_count=22, location=c)
    shell = bpy.context.view_layer.objects.active
    shell.scale = (1, 1.06, 1.05)
    only(shell)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # (the visor: the faces of the front of it, looking out and a little down, become a piece of their own)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for poly in shell.data.polygons:
        d = poly.center - c
        poly.select = d.y < -0.06 and abs(d.z + 0.005) < 0.1 and abs(d.x) < 0.135
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    visor = next(o for o in bpy.context.selected_objects if o is not shell)
    for o, kind in ((shell, 'Suit'), (visor, 'Visor')):
        bpy.context.view_layer.objects.active = o
        if kind == 'Visor':
            o.data.transform(Matrix.Translation(c) @ Matrix.Scale(0.985, 4) @ Matrix.Translation(-c))
        piece(kind, 'head', 1.0)
    # (a rim round the visor, and a lamp on each side of the helmet)
    rim = []
    for k in range(40):
        a = k * math.pi / 20
        x, z = 0.132 * math.cos(a), 0.098 * math.sin(a)
        if abs(x) > 0.1 and abs(z) > 0.07:
            x, z = x * 0.93, z * 0.93
        y = -math.sqrt(max(0.0, 0.186 ** 2 - x * x - z * z))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.013, segments=8, ring_count=5, location=(c.x + x, c.y + y * 1.04, c.z - 0.005 + z))
        piece('Trim', 'head', 0.6)
    for sd in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=0.05, vertices=14, location=(c.x + sd * 0.175, c.y - 0.04, c.z + 0.05), rotation=(math.pi / 2, 0, 0))
        piece('Trim', 'head', 0.65)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=0.03, vertices=16, location=(c.x + sd * 0.182, c.y + 0.01, c.z - 0.02), rotation=(0, math.pi / 2, 0))
        piece('Trim', 'head', 0.55)
    # The life-support pack on his back, with its two tanks; the box of controls on his chest; the hoses between.
    ch = J('spine_03')
    def block(w, h, d, x, y, z, bone, bevel=0.012, base=0.8):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
        o = bpy.context.view_layer.objects.active
        o.scale = (w, d, h)
        only(o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        m = o.modifiers.new('bevel', 'BEVEL'); m.width, m.segments = bevel, 3
        bpy.ops.object.modifier_apply(modifier=m.name)
        return piece('Trim', bone, base)
    back = ch[1] + 0.2
    block(0.34, 0.46, 0.15, 0, back, ch[2] + 0.12, 'spine_03', 0.03)
    for sd in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.055, depth=0.4, vertices=18, location=(sd * 0.085, back + 0.085, ch[2] + 0.12))
        piece('Trim', 'spine_03', 0.9)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.055, segments=18, ring_count=10, location=(sd * 0.085, back + 0.085, ch[2] + 0.32))
        piece('Trim', 'spine_03', 0.9)
        block(0.03, 0.3, 0.02, sd * 0.19, back - 0.02, ch[2] + 0.12, 'spine_03', 0.006, 0.55)
    for i in range(5):
        block(0.3, 0.012, 0.02, 0, back - 0.08, ch[2] - 0.04 + i * 0.07, 'spine_03', 0.004, 0.55)   # (its straps)
    front = ch[1] - 0.2
    block(0.2, 0.13, 0.07, 0, front, ch[2] + 0.1, 'spine_03', 0.014, 0.85)
    for i in range(4):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.013, depth=0.02, vertices=12, location=(-0.06 + i * 0.04, front - 0.04, ch[2] + 0.125), rotation=(math.pi / 2, 0, 0))
        piece('Trim', 'spine_03', 1.0 if i % 2 else 0.4)
    block(0.14, 0.03, 0.02, 0, front - 0.038, ch[2] + 0.07, 'spine_03', 0.004, 0.35)
    for sd in (-1, 1):                                                        # a hose from the pack, over each shoulder, to the helmet's ring
        pts = [Vector((sd * 0.13, back - 0.02, ch[2] + 0.3)), Vector((sd * 0.16, ch[1] + 0.06, ch[2] + 0.42)), Vector((sd * 0.12, ch[1] - 0.06, H[2] - 0.02))]
        for a, b in zip(pts, pts[1:]):
            for k in range(7):
                p = a.lerp(b, (k + 0.5) / 7)
                bpy.ops.mesh.primitive_torus_add(major_radius=0.02, minor_radius=0.008, major_segments=10, minor_segments=6, location=p, rotation=(b - a).to_track_quat('Z', 'Y').to_euler())
                piece('Trim', 'spine_03', 0.5)
    out = []
    for kind, objs in made.items():
        for o in bpy.data.objects:
            o.select_set(o in objs)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        o = objs[0]
        o.name = kind
        o.data.materials.clear()
        o.data.materials.append(bpy.data.materials.get(kind) or bpy.data.materials.new(kind))
        if o is not body:
            o.parent = rig
            o.modifiers.new('Armature', 'ARMATURE').object = rig
        only(o)
        bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
        out.append(o)
        print('MESH', kind, sum(len(p.vertices) - 2 for p in o.data.polygons), 'tris')
    if PREVIEW:
        scene = bpy.context.scene
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        scene.collection.objects.link(cam)
        scene.camera = cam
        for i, (eye, look) in enumerate([((1.8, -4.2, 1.3), (0, 0, 0.95)), ((-2.6, 3.4, 1.4), (0, 0, 0.95))]):
            cam.location = eye
            cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
            scene.render.resolution_x, scene.render.resolution_y = 700, 900
            scene.render.filepath = PREVIEW.replace('.png', f'_{i}.png')
            scene.render.engine = 'BLENDER_WORKBENCH'
            scene.display.shading.light = 'STUDIO'
            scene.display.shading.color_type = 'VERTEX'
            bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects:
        o.select_set(o in out or o is rig)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_materials='PLACEHOLDER', export_texcoords=False)
    print('EXPORTED', OUT, os.path.getsize(OUT))


try:
    main()
except Exception:
    traceback.print_exc()
