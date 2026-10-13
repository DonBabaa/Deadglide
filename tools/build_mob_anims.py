# Motion capture for the monsters: public/models/mob_anims.json, from the Mixamo clips in dl/ (not in the repository).
#
#   blender --background --python tools/build_mob_anims.py -- dl public/models/mob_anims.json
#   (and names on the end, `spider` or any of CLIPS', to make only those again and leave the rest of the file as it is)
#
# The monsters are not skinned: each is a handful of rigid parts (a body, a head, two arms, two thighs, two shins)
# that the game places every frame (src/enemies/horde.js). So a clip is boiled down to what those parts need, frame
# by frame, in the game's directions (x right, y up, z the way he faces):
#   hips, chest, head   how far each has turned from standing straight (quaternions: x, y, z, w)
#   armL, armR          which way each arm points, shoulder to wrist (unit vectors); thighL/R, calfL/R the same
#   upperL/R, foreL/R   the two halves of each arm, for a monster with elbows: shoulder to elbow, elbow to wrist
#   drop                how far his hips are below (or above) where they are standing, as a share of their height
#
# The spiders move by a tarantula's clips (dl/tarantula-animation: walk, idle, bite, rear, die; names here: swalk,
# sidle, sbite, srear, sdie). Eight legs do not boil down to directions: what is kept is where each foot is, so that
# the game can stand its own spider's legs on the same spots (two stiff halves to a leg, bent to reach):
#   body                how far its body has turned from standing level (a quaternion)
#   lift                how far its body is from where it stands (x, y, z), in spans (a span: how far out, on
#                       average, its feet are from the middle of it)
#   feet                for each foot (front pair first, the right one of each pair first), how far it is from where
#                       it stands (the middle of its step, as it walks), measured from under its body, in spans
#   stride              (the walk) how far a foot travels, front to back, in a step, in spans
import bpy, sys, os, json, math, traceback
from mathutils import Vector, Quaternion

a = sys.argv[sys.argv.index('--') + 1:]
DL, OUT = os.path.abspath(a[0]), os.path.abspath(a[1])
CLIPS = {
    'zwalk': 'Scary Zombie Pack/zombie walk.fbx', 'zrun': 'Scary Zombie Pack/zombie run.fbx', 'zattack': 'Scary Zombie Pack/zombie attack.fbx', 'zscream': 'Scary Zombie Pack/zombie scream.fbx',
    'zbite': 'Scary Zombie Pack/zombie biting.fbx', 'zdeath': 'Scary Zombie Pack/zombie death.fbx', 'zidle': 'Scary Zombie Pack/zombie idle.fbx',
    'mwalk': 'Mutant Walking.fbx', 'mroar': 'Mutant Roaring.fbx', 'mdie': 'Mutant Dying.fbx', 'mjump': 'Mutant Jumping.fbx', 'throw': 'Throw.fbx', 'cards': 'Cards.fbx', 'walk': 'Action Adventure Pack/walking.fbx',
    'mswipe': 'Mutant Swiping.fbx', 'mslam': 'Mutant Jump Attack.fbx', 'mturnr': 'Mutant Right Turn 90.fbx', 'mturnl': 'Mutant Left Turn 45.fbx',
    'sprint': 'Sprint.fbx', 'injured': 'Injured Run.fbx', 'crawlrun': 'Running Crawl.fbx', 'mrun': 'Mutant Run.fbx',
    'sturn': 'Sprint Turn.fbx', 'veer': 'Change Direction.fbx', 'arc': 'Run Forward Arc Right.fbx',
    'wallclimb': 'Sprint To Wall Climb.fbx', 'walldrop': 'Jump From Wall.fbx', 'crouchsprint': 'Crouched To Sprinting.fbx', 'zstand': 'Zombie Stand Up.fbx',
    'hamz': 'hamzitus goyitus.fbx', 'rubi': 'rubistus goyitus.fbx',   # (the clip each of the two brothers came with)
    'runstop': 'Action Adventure Pack/run to stop.fbx',   # (pulling up out of a run: Babitus, before he does anything else)
    'rummage': 'rummaging.fbx',   # (both hands going through something in front of him: Goyitus Ultimus, reaching for Kirky off the last ramp)
    'breathe': 'Breathing Idle.fbx', 'shift': 'Action Adventure Pack/idle.fbx',   # (stood, breathing; stood, shifting about: Babitus at his table in the players' casino, with nobody to deal to)
}
# Turning on the spot: the game turns him (he always faces you), so what is kept of these is the stepping round, and
# not the turn itself (his heading is taken back out of every frame).
ON_THE_SPOT = ('mturnr', 'mturnl', 'sturn', 'veer', 'arc')
# Going up a wall, and coming down off one: the game takes him up and down it, so how high his hips have got is left
# out of these (`rise` keeps it, a hip's height to the unit, for whoever wants to know where in the clip he is).
NO_RISE = ('wallclimb', 'walldrop')
SPIDER = 'tarantula-animation/source/TarantulaBase.fbx'
# The rat runs as another rat does (dl/rat run: a rigged one, with `run-inplace` and `idle`; names here: ratrun,
# ratidle). What is kept, for a body of stiff parts on four legs:
#   body, head          how far each has turned from standing (quaternions)
#   lift                how far its hips are above where they stand, as a share of their height
#   tail                which way its tail runs, root to tip
#   legFL, legFR, legBL, legBR    which way each leg's upper half points (F: fore, B: hind; L: its left), and
#   pawFL, ...                    its lower half, down to the paw
RAT = 'rat run/source/unzipped/inner2/source/rat_02 (merge).fbx'
RAT_LEGS = {'FL': ('ratLegLFront1', 'ratLegLFront2', 'ratLegLFrontPalm'), 'FR': ('ratLegRFront1', 'ratLegRFront2', 'ratLegRFrontPalm'),
            'BL': ('ratLegLBack1', 'ratLegLBack2', 'ratLegLBackPalm'), 'BR': ('ratLegRBack1', 'ratLegRBack2', 'ratLegRBackPalm')}
SPIDER_LOOPS = ('walk', 'idle')   # (round and round: their last frame is their first again, and is left out)
G = lambda v: [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]
GQ = lambda q: [round(q.x, 4), round(q.z, 4), round(-q.y, 4), round(q.w, 4)]


def spider(out):
    path = os.path.join(DL, SPIDER)
    if not os.path.exists(path):
        print('MISSING', SPIDER)
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.fbx(filepath=path)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.animation_data_create()
    fps = scene.render.fps / scene.render.fps_base
    bpy.context.view_layer.update()
    W, B = arm.matrix_world, arm.data.bones
    feet = [f'{side}_leg{k}_4' for k in (1, 2, 3, 4) for side in ('rt', 'lf')]
    flat = lambda v: Vector((v.x, v.y, 0))
    at_rest = W @ B['base'].head_local
    turned = (W @ B['base'].matrix_local).to_quaternion().inverted()
    stood = [W @ B[n].head_local for n in feet]
    span = sum(flat(f - at_rest).length for f in stood) / len(stood)
    # (the game's directions, from the way it is facing: ahead is from its tail to its head, left is to the left of that)
    ahead = flat(W @ B['headTip'].head_local - W @ B['buttTip'].head_local).normalized()
    left = Vector((0, 0, 1)).cross(ahead)
    G = lambda v: [round(v.dot(left), 4), round(v.z, 4), round(v.dot(ahead), 4)]
    GQ = lambda q: [round(Vector((q.x, q.y, q.z)).dot(left), 4), round(q.z, 4), round(Vector((q.x, q.y, q.z)).dot(ahead), 4), round(q.w, 4)]
    print('SPIDER span', round(span, 5), 'ahead', [round(v, 2) for v in ahead], 'left legs at', [round((stood[1] - at_rest).dot(left) / span, 2)], 'fps', fps)
    for action in list(bpy.data.actions):
        key = action.name.split('|')[1] if '|' in action.name else action.name
        arm.animation_data.action = action
        if getattr(arm.animation_data, 'action_slot', 1) is None and getattr(action, 'slots', None):
            arm.animation_data.action_slot = action.slots[0]
        first, last = action.frame_range
        n = max(2, int(round((last - first) / fps * 30)) + 1)
        clip = {'body': [], 'lift': [], 'feet': []}
        for i in range(n - 1 if key in SPIDER_LOOPS else n):
            t = first + (last - first) * i / (n - 1)
            scene.frame_set(int(t), subframe=t - int(t))
            base = arm.pose.bones['base']
            here = W @ base.head
            clip['body'].append(GQ((W.to_quaternion() @ base.matrix.to_quaternion()) @ turned))
            clip['lift'].append(G((here - at_rest) / span if key not in SPIDER_LOOPS else Vector((0, 0, (here - at_rest).z / span))))
            clip['feet'].append([G(((W @ arm.pose.bones[name].head) - flat(here) - (stood[j] - flat(at_rest))) / span) for j, name in enumerate(feet)])
        clip['frames'] = len(clip['body'])
        if key == 'walk':
            clip['stride'] = round(sum(max(f[j][2] for f in clip['feet']) - min(f[j][2] for f in clip['feet']) for j in range(8)) / 8, 4)
        out['s' + key] = clip
        print('CLIP', 's' + key, clip['frames'], 'frames', round((last - first) / fps, 2), 's', clip.get('stride', ''))
    # Where each foot stands is not where the model was built with it (its front legs were built spread wide): it is
    # the middle of that foot's step as it walks. Everything is measured from there.
    walk = out.get('swalk')
    if walk:
        for j in range(8):
            for axis in (0, 2):
                mid = sum(f[j][axis] for f in walk['feet']) / walk['frames']
                for key in ('swalk', 'sidle', 'sbite', 'srear', 'sdie'):
                    for f in out.get(key, {}).get('feet', []):
                        f[j][axis] = round(f[j][axis] - mid, 4)


def rat(out):
    path = os.path.join(DL, RAT)
    if not os.path.exists(path):
        print('MISSING', RAT)
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.fbx(filepath=path)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.animation_data_create()
    fps = scene.render.fps / scene.render.fps_base
    bpy.context.view_layer.update()
    W, B = arm.matrix_world, arm.data.bones
    flat = lambda v: Vector((v.x, v.y, 0))
    # (the game's directions, from the way it stands: ahead is from its hips to its head; left is to the left of that)
    ahead = flat(W @ B['ratHead'].head_local - W @ B['ratPelvis'].head_local).normalized()
    left = Vector((0, 0, 1)).cross(ahead)
    G = lambda v: [round(v.dot(left), 4), round(v.z, 4), round(v.dot(ahead), 4)]
    GQ = lambda q: [round(Vector((q.x, q.y, q.z)).dot(left), 4), round(q.z, 4), round(Vector((q.x, q.y, q.z)).dot(ahead), 4), round(q.w, 4)]
    rest = {k: (W @ B[k].matrix_local).to_quaternion().inverted() for k in ('ratPelvis', 'ratHead')}
    hips0 = (W @ B['ratPelvis'].head_local).z
    at = lambda k: W @ arm.pose.bones[k].head
    for action in list(bpy.data.actions):
        key = {'run-inplace': 'ratrun', 'idle': 'ratidle'}.get(action.name.split('|')[1] if '|' in action.name else action.name)
        if not key:
            continue
        arm.animation_data.action = action
        if getattr(arm.animation_data, 'action_slot', 1) is None and getattr(action, 'slots', None):
            arm.animation_data.action_slot = action.slots[0]
        first, last = action.frame_range
        n = max(2, int(round((last - first) / fps * 30)))          # (round and round: its last frame is its first again, and is left out)
        clip = {k: [] for k in ('body', 'head', 'lift', 'tail')}
        for leg in RAT_LEGS:
            clip['leg' + leg], clip['paw' + leg] = [], []
        for i in range(n):
            f = first + (last - first) * i / n
            scene.frame_set(int(f), subframe=f - int(f))
            Wq = W.to_quaternion()
            clip['body'].append(GQ((Wq @ arm.pose.bones['ratPelvis'].matrix.to_quaternion()) @ rest['ratPelvis']))
            clip['head'].append(GQ((Wq @ arm.pose.bones['ratHead'].matrix.to_quaternion()) @ rest['ratHead']))
            clip['lift'].append(round((at('ratPelvis').z - hips0) / hips0, 4))
            clip['tail'].append(G((at('ratTail5') - at('ratTail1')).normalized()))
            for leg, (a1, a2, a3) in RAT_LEGS.items():
                clip['leg' + leg].append(G((at(a2) - at(a1)).normalized()))
                clip['paw' + leg].append(G((at(a3) - at(a2)).normalized()))
        clip['frames'] = n
        out[key] = clip
        print('CLIP', key, n, 'frames', round(n / 30, 2), 's', 'ahead', [round(v, 2) for v in ahead])


def main():
    out = {}
    if a[2:]:
        with open(OUT) as fh:
            out = json.load(fh)['clips']
    for name, file in CLIPS.items():
        if a[2:] and name not in a[2:]:
            continue
        path = os.path.join(DL, file)
        if not os.path.exists(path):
            print('MISSING', file)
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        scene.render.fps = 30
        try:
            bpy.ops.import_scene.fbx(filepath=path)
        except Exception:
            traceback.print_exc()
            continue
        arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
        B = {b.name.split(':')[-1]: b.name for b in arm.data.bones}
        W = arm.matrix_world
        rest = {k: (W @ arm.data.bones[B[k]].matrix_local).to_quaternion().inverted() for k in ('Hips', 'Spine2', 'Head')}
        hips0 = (W @ arm.data.bones[B['Hips']].head_local).z
        first, last = (int(round(v)) for v in arm.animation_data.action.frame_range)
        clip = {k: [] for k in ('hips', 'chest', 'head', 'armL', 'armR', 'upperL', 'upperR', 'foreL', 'foreR', 'thighL', 'thighR', 'calfL', 'calfR', 'drop')}
        at = lambda k: W @ arm.pose.bones[B[k]].head
        for f in range(first, last + 1):
            scene.frame_set(f)
            Wq = W.to_quaternion()
            back = Quaternion()
            if name in ON_THE_SPOT:
                ahead = ((Wq @ arm.pose.bones[B['Hips']].matrix.to_quaternion()) @ rest['Hips']) @ Vector((0, -1, 0))
                back = Quaternion((0, 0, 1), -math.atan2(ahead.x, -ahead.y))
            for key, bone in (('hips', 'Hips'), ('chest', 'Spine2'), ('head', 'Head')):
                clip[key].append(GQ(back @ ((Wq @ arm.pose.bones[B[bone]].matrix.to_quaternion()) @ rest[bone])))
            for s, S in (('L', 'Left'), ('R', 'Right')):
                clip['arm' + s].append(G(back @ (at(S + 'Hand') - at(S + 'Arm')).normalized()))
                clip['upper' + s].append(G(back @ (at(S + 'ForeArm') - at(S + 'Arm')).normalized()))
                clip['fore' + s].append(G(back @ (at(S + 'Hand') - at(S + 'ForeArm')).normalized()))
                clip['thigh' + s].append(G(back @ (at(S + 'Leg') - at(S + 'UpLeg')).normalized()))
                clip['calf' + s].append(G(back @ (at(S + 'Foot') - at(S + 'Leg')).normalized()))
            rise = (at('Hips').z - hips0) / hips0
            if name in NO_RISE:
                clip.setdefault('rise', []).append(round(rise, 3))
                rise = 0.0
            clip['drop'].append(round(rise, 4))
        clip['frames'] = last - first + 1
        out[name] = clip
        print('CLIP', name, clip['frames'], 'frames')
    try:
        if not a[2:] or 'spider' in a[2:]:
            spider(out)
    except Exception:
        traceback.print_exc()
    try:
        if not a[2:] or 'rat' in a[2:]:
            rat(out)
    except Exception:
        traceback.print_exc()
    with open(OUT, 'w') as fh:
        json.dump({'fps': 30, 'clips': out}, fh, separators=(',', ':'))
    print('WROTE', OUT, os.path.getsize(OUT))


try:
    main()
except Exception:
    traceback.print_exc()
