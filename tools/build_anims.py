# Puts motion-captured animation onto Kirky's skeleton: public/models/kirky_anims.glb (a skeleton and its clips, no
# meshes), for the game to play on him (src/player/kirkyBody.js).
#
#   blender --background --python tools/build_anims.py -- public/models/kirky.glb public/models/kirky_anims.glb dl
#
# The clips come from the library in dl/ (not in the repository: Mixamo animations, which are on Mixamo's skeleton,
# and a skater whose skeleton is MakeHuman's, like Kirky's). Each is copied across bone by bone: how far a bone of
# theirs has turned from its rest, applied to the bone of his that does the same job, after lining the two rests up
# (theirs stand in a T, he stands in an A). Turns only; how far his hips have dropped (or risen) from where they stand,
# frame by frame, as a share of their height, goes beside it in kirky_anims.json (falling down dead, a jump).
import bpy, sys, os, json, traceback
from mathutils import Quaternion, Vector

a = sys.argv[sys.argv.index('--') + 1:]
KIRKY, OUT, DL = os.path.abspath(a[0]), os.path.abspath(a[1]), os.path.abspath(a[2])
FPS = 30
# his bone -> [theirs on Mixamo's skeleton, the bone of his it runs toward (which way it points)]
MIX = {
    'pelvis': ('Hips', 'spine_01'), 'spine_01': ('Spine', 'spine_02'), 'spine_02': ('Spine1', 'spine_03'), 'spine_03': ('Spine2', 'neck_01'), 'neck_01': ('Neck', 'head'), 'head': ('Head', None),
    **{f'{k}_{s}': (S + v, c and f'{c}_{s}') for s, S in (('l', 'Left'), ('r', 'Right')) for k, (v, c) in {
        'clavicle': ('Shoulder', 'upperarm'), 'upperarm': ('Arm', 'lowerarm'), 'lowerarm': ('ForeArm', 'hand'), 'hand': ('Hand', None),
        'thigh': ('UpLeg', 'calf'), 'calf': ('Leg', 'foot'), 'foot': ('Foot', 'ball'), 'ball': ('ToeBase', None)}.items()},
}
# name -> (file, first frame, last frame, their skeleton: 'mixamo' or 'human'[, True: mirrored, left for right])
# (mirrored: Mixamo's people hold a gun in their right hand, and he holds his in his left)
CLIPS = {
    'ride': ('rolling.fbx', 1, 31, 'mixamo'),
    'push': ('Skateboarding.fbx', 1, 66, 'mixamo'),
    'ollie': ('skater.glb', 14, 48, 'human'),
    'air': ('Action Adventure Pack/falling idle.fbx', 1, 0, 'mixamo'),
    'land': ('Action Adventure Pack/hard landing.fbx', 1, 0, 'mixamo'),
    'hit': ('Head Hit.fbx', 1, 0, 'mixamo'),
    'die': ('Dying.fbx', 1, 0, 'mixamo'),
    'idle': ('Action Adventure Pack/idle.fbx', 1, 0, 'mixamo'),
    'walk': ('Action Adventure Pack/walking.fbx', 1, 0, 'mixamo'),
    'run': ('Action Adventure Pack/running.fbx', 1, 0, 'mixamo'),
    'jump': ('Standing Jump.fbx', 1, 0, 'mixamo'),
    'flair': ('Flair.fbx', 1, 0, 'mixamo'),
    'shoot': ('Shooting.fbx', 1, 0, 'mixamo'),
    'rifle': ('Firing Rifle.fbx', 1, 0, 'mixamo'),
    'riflewalk': ('Walk With Rifle.fbx', 1, 0, 'mixamo'),
    'riflejump': ('Rifle Jump.fbx', 1, 0, 'mixamo'),
    'climb': ('Climbing Ladder.fbx', 1, 0, 'mixamo'),
    'stop': ('Action Adventure Pack/run to stop.fbx', 1, 0, 'mixamo'),
    'roll': ('Action Adventure Pack/falling to roll.fbx', 1, 0, 'mixamo'),
    'idle2': ('Action Adventure Pack/idle (3).fbx', 1, 0, 'mixamo'),
    'aim': ('Aim Pistol.fbx', 1, 0, 'mixamo'),                     # sat down, a pistol brought up and held on something (in his left hand, as it happens: no need to mirror it)
    'sit': ('Male Sitting Pose.fbx', 1, 0, 'mixamo'),
    'sitgun': ('Sitting Gun Motion.fbx', 1, 0, 'mixamo', True),
    'pistolidle': ('Pistol Idle.fbx', 1, 0, 'mixamo', True),
    'breathe': ('Breathing Idle.fbx', 1, 0, 'mixamo'),
    # The casino: sitting down; what the emote wheel does (a dance, a wave, a cheer: stood, getting up to, and sat);
    # and one drink too many (stood swaying, walking, walking backwards, turning).
    'sitdown': ('Stand To Sit.fbx', 1, 0, 'mixamo'),
    'dance': ('Hip Hop Dancing.fbx', 1, 0, 'mixamo'),
    'wave': ('Waving.fbx', 1, 0, 'mixamo'),
    'cheer': ('Cheering.fbx', 1, 0, 'mixamo'),
    'cheerup': ('cheer standing up.fbx', 1, 0, 'mixamo'),
    'cheersit': ('Cheering While Sitting.fbx', 1, 0, 'mixamo'),
    'drunkidle': ('Drunk Idle Variation.fbx', 1, 0, 'mixamo'),
    'drunkwalk': ('Drunk Walk.fbx', 1, 0, 'mixamo'),
    'drunkback': ('Drunk Walk Backwards.fbx', 1, 0, 'mixamo'),
    'drunkturn': ('Drunk Walking Turn.fbx', 1, 0, 'mixamo'),
    # (and, in the casino too: flat out across the floor, and a jump off it)
    'sprint': ('Sprint.fbx', 1, 0, 'mixamo'),
    'leap': ('Action Adventure Pack/jumping up.fbx', 1, 0, 'mixamo'),
}


def world_rest(arm, bone):
    return (arm.matrix_world @ bone.matrix_local).to_quaternion()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=KIRKY)
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    rig.animation_data_create()
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    T = rig.data.bones
    order = [b.name for b in T if b.name in MIX]          # (parents before children)
    armW = rig.matrix_world.to_quaternion()
    restA = {n: T[n].matrix_local.to_quaternion() for n in order}                      # in the skeleton's own space
    restW = {n: armW @ restA[n] for n in order}
    head = lambda arm, b: arm.matrix_world @ b.head_local
    made, drops = [], {}
    for name, entry in CLIPS.items():
        file, first, last, kind = entry[:4]
        mirror = len(entry) > 4 and entry[4]
        other = lambda theirs: theirs if not mirror else 'Right' + theirs[4:] if theirs.startswith('Left') else 'Left' + theirs[5:] if theirs.startswith('Right') else theirs
        flip = (lambda v: Vector((-v.x, v.y, v.z))) if mirror else (lambda v: v)
        path = os.path.join(DL, file)
        if not os.path.exists(path):
            print('MISSING', file)
            continue
        before = set(bpy.data.objects)
        try:
            (bpy.ops.import_scene.fbx if path.lower().endswith('.fbx') else bpy.ops.import_scene.gltf)(filepath=path)
        except Exception:
            traceback.print_exc()
            continue
        new = set(bpy.data.objects) - before
        src = next(o for o in new if o.type == 'ARMATURE')
        S = src.data.bones
        find = (lambda theirs: next((b for b in S if b.name.split(':')[-1] == theirs), None)) if kind == 'mixamo' else None
        pair = {}
        for n in order:
            sb = find(other(MIX[n][0])) if kind == 'mixamo' else S.get(n + '_human')
            if sb is None:
                continue
            # which way each points at rest: toward the bone it runs to
            to = MIX[n][1]
            sto = (find(other(MIX[to][0])) if kind == 'mixamo' else S.get(to + '_human')) if to else None
            if to and sto is not None:
                td, sd = (head(rig, T[to]) - head(rig, T[n])).normalized(), flip(head(src, sto) - head(src, sb)).normalized()
                line_up = td.rotation_difference(sd)
            else:
                line_up = pair[T[n].parent.name][2] if T[n].parent and T[n].parent.name in pair else Quaternion()
            pair[n] = (sb.name, world_rest(src, sb).inverted(), line_up)
        act_src = src.animation_data.action if src.animation_data else None
        if last <= 0 and act_src:
            last = int(round(act_src.frame_range[1]))
        act = bpy.data.actions.new(name)
        rig.animation_data.action = act
        hips = find('Hips') if kind == 'mixamo' else S.get('pelvis_human')
        stand = head(src, hips).z if hips is not None else 0
        drops[name] = []
        for f in range(first, last + 1):
            scene.frame_set(f)
            if hips is not None and stand > 1e-6:
                drops[name].append(round(((src.matrix_world @ src.pose.bones[hips.name].head).z - stand) / stand, 4))
            srcW = src.matrix_world.to_quaternion()
            got = {}
            for n in order:
                if n not in pair:
                    continue
                sname, rest_inv, line_up = pair[n]
                now = srcW @ src.pose.bones[sname].matrix.to_quaternion()
                turned = now @ rest_inv                                       # how far theirs has turned from its rest, in the world
                if mirror:
                    turned = Quaternion((turned.w, turned.x, -turned.y, -turned.z))
                want = turned @ line_up @ restW[n]                            # where his bone should be turned to, in the world
                wantA = armW.inverted() @ want
                # (what it hangs from: the nearest bone above it that has been turned. One in between that no bone of
                # theirs answers to, his second neck bone, stays as it stood on the one above it, and so is turned with it)
                parent = T[n].parent
                while parent and parent.name not in got:
                    parent = parent.parent
                base = got[parent.name] @ (restA[parent.name].inverted() @ restA[n]) if parent else restA[n]
                got[n] = wantA
                q = base.inverted() @ wantA
                pb = rig.pose.bones[n]
                prev = pb.rotation_quaternion.copy()
                if prev.dot(q) < 0:
                    q.negate()                                                # (the short way round from the last frame)
                pb.rotation_quaternion = q
                pb.keyframe_insert('rotation_quaternion', frame=f - first + 1)
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, act)
        rig.animation_data.action = None
        made.append((name, last - first + 1))
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
        for block in (bpy.data.meshes, bpy.data.images, bpy.data.materials):
            for d in list(block):
                if d.users == 0:
                    block.remove(d)
        print('CLIP', name, last - first + 1, 'frames, from', file)
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
    for o in bpy.data.objects:
        o.select_set(o is rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_yup=True, export_skins=True, export_force_sampling=True, export_optimize_animation_size=True)
    with open(os.path.splitext(OUT)[0] + '.json', 'w') as fh:
        json.dump({'fps': FPS, 'drop': drops}, fh, separators=(',', ':'))
    print('EXPORTED', OUT, os.path.getsize(OUT), made)


try:
    main()
except Exception:
    traceback.print_exc()
