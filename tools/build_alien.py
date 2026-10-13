# Builds the body Kirky wears as an alien (The Grey, Void Walker, Little Green Man): public/models/alien.glb.
#
#   blender --background --python tools/build_alien.py -- public/models/alien.glb [preview.png]
#
# It starts as a MakeHuman body on the same skeleton as Kirky's own (so the game can pose it bone for bone from his:
# see src/player/kirkyBody.js), with the same lengths of limb, and is then made into something that is not a person:
# a great bulb of a skull over a small pointed face, no nose to speak of, a slit of a mouth, a neck like a stalk, a
# narrow chest and a little pot belly, arms and legs like sticks, long fingers, and two huge black eyes.
# It has no clothes and no picture on it: its colour comes from the game (one body, three aliens), over a mottling
# that is baked onto its points here. Uses only the MakeHuman base mesh (CC0).
import bpy, sys, os, math, traceback
import numpy as np
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0])
PREVIEW = os.path.abspath(args[1]) if len(args) > 1 else None

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService

DATA = LocationService.get_user_data()
SYSTEM = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(sys.modules[HumanService.__module__].__file__))), 'data', 'targets')


def only(o):
    for ob in bpy.data.objects:
        ob.select_set(ob is o)
    bpy.context.view_layer.objects.active = o


def noise(P, f, seed=0.0):
    x, y, z = P[:, 0] * f + seed, P[:, 1] * f + seed * 1.7, P[:, 2] * f - seed
    return (np.sin(x + 1.3 * np.sin(y * 1.7 + z)) + np.sin(y * 1.3 + 1.1 * np.sin(z * 1.9 + x)) + np.sin(z * 1.1 + 1.2 * np.sin(x * 1.5 + y))) / 6 + 0.5


# What MakeHuman is asked for, and how hard (past 1: further than it was meant to go).
SHAPE = {
    'head/head-oval': 1.0, 'head/head-invertedtriangular': 1.0, 'head/head-age-decr': 1.0, 'forehead/forehead-scale-vert-incr': 1.0, 'forehead/forehead-temple-incr': 1.0,
    'chin/chin-triangle': 1.0, 'chin/chin-width-decr': 1.0, 'chin/chin-height-decr': 1.0, 'chin/chin-prominent-decr': 1.0, 'chin/chin-bones-decr': 1.0,
    'cheek/l-cheek-volume-decr': 1.0, 'cheek/r-cheek-volume-decr': 1.0,
    'nose/nose-volume-decr': 1.0, 'nose/nose-scale-horiz-decr': 1.0, 'nose/nose-scale-vert-decr': 1.0, 'nose/nose-scale-depth-decr': 1.0,
    'ears/l-ear-scale-decr': 1.0, 'ears/r-ear-scale-decr': 1.0, 'ears/l-ear-wing-decr': 1.0, 'ears/r-ear-wing-decr': 1.0,
    'mouth/mouth-scale-horiz-decr': 1.0, 'mouth/mouth-lowerlip-volume-decr': 1.0, 'mouth/mouth-upperlip-volume-decr': 1.0,
    'eyebrows/eyebrows-trans-backward': 1.0,
    'hands/l-hand-fingers-length-incr': 1.6, 'hands/r-hand-fingers-length-incr': 1.6, 'hands/l-hand-fingers-diameter-decr': 1.0, 'hands/r-hand-fingers-diameter-decr': 1.0,
    'stomach/stomach-pregnant-incr': 0.45, 'torso/torso-muscle-pectoral-decr': 1.0, 'torso/torso-vshape-decr': 1.0,
}
# How much of its girth each part keeps (its length stays: it has to fit Kirky's skeleton).
THIN = {'neck_01': 0.5, 'spine_03': 0.74, 'spine_02': 0.76, 'spine_01': 0.8, 'pelvis': 0.82, 'upperarm': 0.55, 'lowerarm': 0.55, 'thigh': 0.58, 'calf': 0.55, 'foot': 0.8, 'ball': 0.8}


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TargetService.get_default_macro_info_dict()
    macro.update({'gender': 1.0, 'age': 0.5, 'muscle': 0.1, 'weight': 0.15, 'height': 0.55, 'proportions': 0.7})   # (Kirky's height and proportions)
    macro['race'] = {'asian': 0.34, 'caucasian': 0.33, 'african': 0.33}
    body = HumanService.create_human(scale=0.1, macro_detail_dict=macro)
    for name, weight in SHAPE.items():
        path = os.path.join(SYSTEM, *name.split('/')) + '.target.gz'
        if not os.path.exists(path):
            print('NO TARGET', name)
            continue
        TargetService.load_target(body, path, weight=min(weight, 1.0))
        short = name.split('/')[-1]
        block = next((b for b in body.data.shape_keys.key_blocks if short in b.name), None)
        if block and weight > 1:
            block.slider_max = 5
            block.value = weight
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

    # ---- Not a person ----
    mesh = body.data
    n = len(mesh.vertices)
    mw = np.array(body.matrix_world)
    co = np.empty(n * 3); mesh.vertices.foreach_get('co', co)
    P = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    groups = {g.name: g.index for g in body.vertex_groups}
    W = {}
    def weights(name):
        if name not in W:
            w = np.zeros(n)
            gi = groups.get(name)
            if gi is not None:
                for v in mesh.vertices:
                    for g in v.groups:
                        if g.group == gi:
                            w[v.index] = g.weight
            W[name] = w
        return W[name]
    bone = lambda name: (np.array(rig.matrix_world @ rig.data.bones[name].head_local), np.array(rig.matrix_world @ rig.data.bones[name].tail_local))
    # Sticks for limbs, a stalk for a neck: everything drawn in toward the bone it hangs on.
    for name, keep in THIN.items():
        for side in ('', '_l', '_r'):
            full = name + side
            if full not in rig.data.bones:
                continue
            a, b = bone(full)
            axis = (b - a) / np.linalg.norm(b - a)
            w = weights(full)
            d = P - a
            along = d @ axis
            radial = d - along[:, None] * axis
            P -= radial * (w * (1 - keep))[:, None]
    # The skull: half as big again, and swelling out above the eyes into a bulb; the jaw drawn in to a point.
    J, top = bone('head')
    w = weights('head')
    d = P - J
    h = d[:, 2]
    tall = float(h[w > 0.9].max())
    # (first, its face is flattened: nothing stands forward of a plane just behind where the tip of its nose was)
    mid = (w > 0.5) & (np.abs(d[:, 0]) < 0.045) & (h > -0.09) & (h < tall * 0.62)
    nose_tip = float(d[mid, 1].min())
    flat = nose_tip + 0.034 + 0.01 * (np.abs(d[:, 0]) / 0.045)
    d[mid, 1] = np.maximum(d[mid, 1], flat[mid])
    up = np.clip((h - tall * 0.42) / (tall * 0.4), 0, 1); up = up * up * (3 - 2 * up)
    low = np.clip((tall * 0.3 - h) / (tall * 0.3), 0, 1)
    k = 1 + w * (0.4 + 0.62 * up)
    d[:, 0] *= k * (1 - 0.22 * low * w); d[:, 1] *= k * (1 - 0.1 * low * w); d[:, 2] *= 1 + w * (0.38 + 0.1 * up)
    d[:, 1] += w * up * tall * 0.16                                    # (and back: the bulb of it is behind his face)
    P = J + d
    inv = np.linalg.inv(mw)
    mesh.vertices.foreach_set('co', (P @ inv[:3, :3].T + inv[:3, 3]).ravel())
    mesh.update()
    only(body)
    bpy.ops.object.shade_smooth()

    # Its colour: none of its own (the game gives it one), over a mottle: paler down its front and on its skull,
    # darker in its hollows and at its joints, veined.
    which = np.empty(len(mesh.loops), dtype=np.int32); mesh.loops.foreach_get('vertex_index', which)
    no = np.empty(n * 3); mesh.vertices.foreach_get('normal', no); N = no.reshape(-1, 3)
    shade = 0.78 + 0.2 * noise(P, 26, 1.0) + 0.1 * noise(P, 70, 4.0)
    shade *= 0.86 + 0.14 * np.clip(-N[:, 1] * 0.8 + N[:, 2] * 0.6, -1, 1)
    vein = np.abs(noise(P, 14, 9.0) - 0.5) < 0.02
    shade[vein] *= 0.78
    col = np.clip(np.stack([shade, shade, shade], 1), 0, 1) ** 2.2
    layer = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    layer.data.foreach_set('color', np.concatenate([col[which], np.ones((len(which), 1))], 1).ravel())
    mesh.color_attributes.active_color = layer
    mesh.materials.clear()
    mesh.materials.append(bpy.data.materials.new('Alien'))
    body.name = 'Alien'

    # Its eyes: two great black almonds, wrapped round the front of its skull, slanting up and out.
    face = P[(w > 0.9) & (np.abs(P[:, 0]) < 0.012)]
    front = float(face[:, 1].min())                                    # (the foremost point of its face, on the middle line)
    EYE, RAD = (0.052, 0.034, tall * 0.35 * 1.38), (0.06, 0.03, 0.044)   # (where each eye is: out from the middle, back from the front of its face, up from the joint of its neck; and its size)
    eyes = []
    for sd in (-1, 1):
        at = Vector((sd * EYE[0], front + EYE[1], J[2] + EYE[2]))
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=24, ring_count=14, location=at)
        e = bpy.context.view_layer.objects.active
        e.scale = RAD
        e.rotation_euler = (0, sd * -0.42, sd * -0.5)
        only(e)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.object.shade_smooth()
        eyes.append(e)
    for o in bpy.data.objects:
        o.select_set(o in eyes)
    bpy.context.view_layer.objects.active = eyes[0]
    bpy.ops.object.join()
    eye = eyes[0]
    eye.name = 'AlienEyes'
    eye.data.materials.append(bpy.data.materials.new('AlienEyes'))
    eye.parent = rig
    eye.vertex_groups.new(name='head').add(list(range(len(eye.data.vertices))), 1.0, 'REPLACE')
    eye.modifiers.new('Armature', 'ARMATURE').object = rig
    # (its skin drawn back where the eyes sit, so that they are set into it and not stuck on)
    centre = np.array([[sd * EYE[0], front + EYE[1], J[2] + EYE[2]] for sd in (-1, 1)])
    for c in centre:
        d2 = (P - c) / np.array(RAD)
        inside = np.clip(1.25 - np.linalg.norm(d2, axis=1), 0, 1) * w
        P[:, 1] += inside * 0.012
    mesh.vertices.foreach_set('co', (P @ inv[:3, :3].T + inv[:3, 3]).ravel())
    mesh.update()

    only(body)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    print('MESH Alien', sum(len(p.vertices) - 2 for p in mesh.polygons), 'tris; head', [round(float(v), 3) for v in J], 'tall', round(tall, 3), 'front', round(front, 3))
    for name in ('pelvis', 'head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'thigh_l', 'calf_l', 'foot_l'):
        print('BONE', name, [round(float(v), 4) for v in bone(name)[0]])

    if PREVIEW:
        scene = bpy.context.scene
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        scene.collection.objects.link(cam)
        scene.camera = cam
        for i, (eye_at, look) in enumerate([((1.6, -4.2, 1.2), (0, 0, 0.95)), ((0.4, -1.3, 1.75), (0, 0, 1.68)), ((3.6, 0.3, 1.2), (0, 0, 0.95))]):
            cam.location = eye_at
            cam.rotation_euler = (Vector(look) - Vector(eye_at)).to_track_quat('-Z', 'Y').to_euler()
            scene.render.resolution_x, scene.render.resolution_y = 700, 900
            scene.render.filepath = PREVIEW.replace('.png', f'_{i}.png')
            scene.render.engine = 'BLENDER_WORKBENCH'
            scene.display.shading.light = 'STUDIO'
            scene.display.shading.color_type = 'VERTEX'
            bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects:
        o.select_set(o in (body, eye, rig))
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=True, export_yup=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_materials='PLACEHOLDER', export_texcoords=False)
    print('EXPORTED', OUT, os.path.getsize(OUT))


try:
    main()
except Exception:
    traceback.print_exc()
