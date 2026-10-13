# Builds Kirky's body: public/models/kirky.glb, for the game to load (src/player/kirkyBody.js).
#
#   blender --background --python tools/build_kirky.py -- public/models/kirky.glb [preview.png] ["dl/Pistol Idle.fbx"]
#
# He is the man in the fedora who comes inside some of the clips in dl/ (not in the repository; Mixamo's "Boss": a
# stocky man in a hat, a red shirt and waistcoat, tan trousers and black shoes; see public/models/CREDITS.txt). What
# is done to him here is only what the game needs of him:
#   - stood as he was made (no clip), on the ground, a size that suits the board and the zombies
#   - his skeleton called by the names the game knows bones by (pelvis, spine_01, upperarm_l, thigh_r...)
#   - his pieces called by what they are to the game: Body (his arms and hands), Face (his head), Eyes, Teeth, Shirt
#     (shirt and waistcoat), Pants, Shoes, Hat
#   - his cigar taken out: what is in his mouth is the game's (a boof, most days)
# (tools/build_kirky_skater.py builds another Kirky, a skater, kept as a second skin.)
import bpy, sys, os, math, traceback
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0])
PREVIEW = os.path.abspath(args[1]) if len(args) > 1 and args[1].endswith('.png') else None
BASE = os.path.abspath(next((a for a in args[1:] if a.endswith('.fbx')), 'dl/Pistol Idle.fbx'))
TALL = 1.8           # how tall he is made, to the top of his hat (m)
NAMES = {'Hips': 'pelvis', 'Spine': 'spine_01', 'Spine1': 'spine_02', 'Spine2': 'spine_03', 'Neck': 'neck_01', 'Neck1': 'neck_02', 'Head': 'head'}
for side, s in (('Left', 'l'), ('Right', 'r')):
    for theirs, ours in (('Shoulder', 'clavicle'), ('Arm', 'upperarm'), ('ForeArm', 'lowerarm'), ('Hand', 'hand'), ('UpLeg', 'thigh'), ('Leg', 'calf'), ('Foot', 'foot'), ('ToeBase', 'ball')):
        NAMES[side + theirs] = f'{ours}_{s}'
    for finger in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'):
        for n in (1, 2, 3):
            NAMES[f'{side}Hand{finger}{n}'] = f'{finger.lower()}_0{n}_{s}'
PIECES = {'Arms': 'Body', 'Head': 'Face', 'Jacket': 'Shirt', 'Pants': 'Pants', 'Shoes': 'Shoes', 'Hat': 'Hat', 'L_Eye': 'Eyes', 'R_Eye': 'Eyes', 'Teeth_Down': 'Teeth', 'Teeth_Up': 'Teeth'}


def world_points(o):
    pts = np.empty(len(o.data.vertices) * 3, dtype=np.float64)
    o.data.vertices.foreach_get('co', pts)
    pts = pts.reshape(-1, 3)
    m = np.array(o.matrix_world)
    return pts @ m[:3, :3].T + m[:3, 3]


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.fbx(filepath=BASE)
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    # As he was made, not as the clip left him: no animation, nothing holding him but himself.
    rig.animation_data_clear()
    for pb in rig.pose.bones:
        pb.location, pb.rotation_quaternion, pb.rotation_euler, pb.scale = (0, 0, 0), (1, 0, 0, 0), (0, 0, 0), (1, 1, 1)
    bpy.context.view_layer.update()
    for o in meshes + [rig]:
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
    # On the ground, and the size he is to be.
    low = min(float(world_points(o)[:, 2].min()) for o in meshes)
    high = max(float(world_points(o)[:, 2].max()) for o in meshes)
    k = TALL / (high - low)
    for o in meshes + [rig]:
        o.location.z -= low
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in meshes + [rig]:
        o.scale = (k, k, k)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in meshes:
        o.parent = rig
    # The skeleton, by the names the game knows it by.
    for b in rig.data.bones:
        short = b.name.split(':')[-1]
        b.name = NAMES.get(short, short)
    rig.name = 'Kirky'
    print('STANDS', round(high - low, 3), 'm as he came,', TALL, 'm now; hips', [round(v, 3) for v in rig.data.bones['thigh_l'].head_local], 'head', [round(v, 3) for v in rig.data.bones['head'].head_local])

    # His pieces. (The cigar goes; two eyes are one piece, and so are his two rows of teeth.)
    image = next(i for i in bpy.data.images if 'diffuse' in i.filepath.lower() or 'diffuse' in i.name.lower())
    image.name = 'kirky_skin'
    groups = {}
    for o in list(meshes):
        short = o.name.split(':')[-1].replace('_Geo', '')
        if short not in PIECES:
            print('LEFT OUT', o.name)
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        groups.setdefault(PIECES[short], []).append(o)
    made = []
    for name, parts in groups.items():
        for ob in bpy.data.objects:
            ob.select_set(ob in parts)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        o = parts[0]
        o.name = name
        o.data.name = name
        # (one picture colours all of him: each piece has its own plain material of it, so the game can treat each differently)
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        tree = mat.node_tree
        shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
        shader.inputs['Roughness'].default_value = 0.4 if name in ('Shoes', 'Eyes') else 0.8
        tex = tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
        o.data.materials.clear()
        o.data.materials.append(mat)
        # (he came with seven sets of places on the picture, all but the first unused)
        while len(o.data.uv_layers) > 1:
            o.data.uv_layers.remove(o.data.uv_layers[-1])
        for poly in o.data.polygons:
            poly.use_smooth = True
        made.append(o)
        pts = world_points(o)
        print('MESH', name, sum(len(p.vertices) - 2 for p in o.data.polygons), 'tris, from', [round(float(v), 3) for v in pts.min(0)], 'to', [round(float(v), 3) for v in pts.max(0)])
    for other in list(bpy.data.images):
        if other is not image:
            bpy.data.images.remove(other)
    # Where things are on him, for the game (kirkyBody.js keeps these as numbers).
    by = {o.name: world_points(o) for o in made}
    head = rig.data.bones['head'].head_local
    if 'Teeth' in by:
        t = by['Teeth']
        print('MOUTH', [round(float(c), 3) for c in (t[:, 0].mean(), t[:, 1].min(), t[:, 2].mean())], 'from his head bone:', [round(float(c), 3) for c in (t[:, 0].mean() - head.x, t[:, 1].min() - head.y, t[:, 2].mean() - head.z)])
    if 'Face' in by:
        f = by['Face']
        print('SKULL top', round(float(f[:, 2].max()), 3), 'wide', round(float(f[:, 0].max() - f[:, 0].min()), 3), 'deep', round(float(f[:, 1].max() - f[:, 1].min()), 3), 'head bone', [round(v, 3) for v in head])
    for name in ('pelvis', 'spine_03', 'neck_01', 'head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'thigh_l', 'calf_l', 'foot_l', 'ball_l'):
        b = rig.data.bones[name]
        print('BONE', name, [round(v, 4) for v in b.head_local], [round(v, 4) for v in b.tail_local])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    for o in bpy.data.objects:
        o.select_set(o is rig or o in made)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=90, export_animations=False, export_skins=True, export_yup=True)
    print('EXPORTED', OUT, os.path.getsize(OUT))

    if PREVIEW:
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        scene.collection.objects.link(cam)
        scene.camera = cam
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.color_type = 'TEXTURE'
        scene.render.resolution_x, scene.render.resolution_y = 640, 900
        for i, (eye, look) in enumerate([((0.0, -4.6, 1.0), (0, 0, 0.9)), ((0.0, 4.6, 1.0), (0, 0, 0.9)), ((3.4, -3.2, 1.3), (0, 0, 0.9)), ((0.3, -1.2, 1.7), (0, 0, 1.55))]):
            cam.location = eye
            cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = PREVIEW.replace('.png', f'_{i}.png')
            bpy.ops.render.render(write_still=True)
            print('RENDERED', scene.render.filepath)


try:
    main()
except Exception:
    traceback.print_exc()
