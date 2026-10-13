# Builds the monsters that are people (or were): MakeHuman characters (the MPFB add-on for Blender), posed, dressed,
# rotted, and cut into the parts the game swings as they walk (see src/enemies/enemyModels.js: a monster is a handful
# of rigid parts, each hinged at a pivot). Their colours are baked onto their points: no textures.
#
#   blender --background --python tools/build_mobs.py -- public/models/mobs.glb [preview.png]
#
# Each part is exported as a mesh called <monster>_<part> (and <monster>_lite_<part>, thinned out, for far away), sat
# at its pivot. It needs the same asset packs as tools/build_kirky.py. What it uses (all CC0, MakeHuman system
# assets): the body, skin, eyes and teeth, male_casualsuit02 and shoes02.
import bpy, sys, os, math, traceback
import numpy as np
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0])
PREVIEW = os.path.abspath(args[1]) if len(args) > 1 else None

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService

DATA = LocationService.get_user_data()
SYSTEM = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(sys.modules[HumanService.__module__].__file__))), 'data', 'targets')
asset = lambda *parts: os.path.join(DATA, *parts)
U = 'expression/units/caucasian/'


def only(o):
    for ob in bpy.data.objects:
        ob.select_set(ob is o)
    bpy.context.view_layer.objects.active = o


def world_points(o):
    pts = np.empty(len(o.data.vertices) * 3, dtype=np.float64)
    o.data.vertices.foreach_get('co', pts)
    m = np.array(o.matrix_world)
    return pts.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]


def noise(P, f, seed=0.0):
    """Lumpy, between 0 and 1: for mottling, stains and holes."""
    x, y, z = P[:, 0] * f + seed, P[:, 1] * f + seed * 1.7, P[:, 2] * f - seed
    n = np.sin(x * 1.0 + 1.3 * np.sin(y * 1.7 + z)) + np.sin(y * 1.3 + 1.1 * np.sin(z * 1.9 + x)) + np.sin(z * 1.1 + 1.2 * np.sin(x * 1.5 + y))
    return n / 6 + 0.5


def bake(o):
    """A mesh's texture, put onto its corners as colours. Gives back (colours, where each corner is in the world)."""
    mesh = o.data
    n = len(mesh.loops)
    image = None
    if o.material_slots and o.material_slots[0].material and o.material_slots[0].material.use_nodes:
        image = next((x.image for x in o.material_slots[0].material.node_tree.nodes if x.type == 'TEX_IMAGE' and x.image and not any(k in x.image.name.lower() for k in ('norm', '_ao', 'bump', 'spec'))), None)
    colours = np.full((n, 3), 0.6, dtype=np.float32)
    if image and mesh.uv_layers.active:
        W, H = image.size
        px = np.array(image.pixels[:], dtype=np.float32).reshape(H, W, 4)
        uv = np.empty(n * 2, dtype=np.float32)
        mesh.uv_layers.active.data.foreach_get('uv', uv)
        uv = uv.reshape(-1, 2)
        colours = px[np.clip((uv[:, 1] % 1.0 * H).astype(int), 0, H - 1), np.clip((uv[:, 0] % 1.0 * W).astype(int), 0, W - 1), :3].copy()
    which = np.empty(n, dtype=np.int32)
    mesh.loops.foreach_get('vertex_index', which)
    return colours, world_points(o)[which]


def paint(o, colours):
    mesh = o.data
    for a in list(mesh.color_attributes):
        mesh.color_attributes.remove(a)
    layer = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    rgba = np.concatenate([np.clip(colours, 0, 1) ** 2.2, np.ones((len(colours), 1), dtype=np.float32)], 1)
    layer.data.foreach_set('color', rgba.ravel())
    mesh.color_attributes.active_color = layer
    mesh.color_attributes.render_color_index = 0


def human(macro, face):
    m = TargetService.get_default_macro_info_dict()
    m.update(macro)
    m['race'] = {'asian': 0.2, 'caucasian': 0.6, 'african': 0.2}
    body = HumanService.create_human(scale=0.1, macro_detail_dict=m)
    for name, weight in face.items():
        path = os.path.join(SYSTEM, *name.split('/')) + '.target.gz'
        if os.path.exists(path):
            TargetService.load_target(body, path, weight=weight)
        else:
            print('NO TARGET', name)
    HumanService.add_builtin_rig(body, 'game_engine')
    HumanService.set_character_skin(asset('skins', 'young_caucasian_male', 'young_caucasian_male.mhmat'), body, skin_type='GAMEENGINE')
    return body, body.parent


def wear(body, kind, *path):
    before = set(bpy.data.objects)
    try:
        HumanService.add_mhclo_asset(asset(*path), body, asset_type=kind, subdiv_levels=0, material_type='MAKESKIN')
    except Exception:
        traceback.print_exc()
    return next(iter(set(bpy.data.objects) - before), None)


def turn(rig, name, axis, degrees):
    """Turn a bone (and what hangs off it) about a line through its joint, given in the world."""
    pb = rig.pose.bones[name]
    M = rig.matrix_world @ pb.matrix
    at = M.translation.copy()
    pb.matrix = rig.matrix_world.inverted() @ (Matrix.Translation(at) @ Matrix.Rotation(math.radians(degrees), 4, Vector(axis)) @ Matrix.Translation(-at) @ M)
    bpy.context.view_layer.update()


ARM = ('upperarm', 'lowerarm', 'hand', 'index', 'middle', 'ring', 'pinky', 'thumb')
LEG = ('thigh', 'calf', 'foot', 'ball')


def part_of(bone):
    side = bone[-2:]
    if bone == 'head':
        return 'head'
    if side in ('_l', '_r'):
        if bone.startswith(ARM):
            return 'arm' + side
        if bone.startswith(LEG):
            return 'leg' + side
    return 'body'


def figure(spec):
    """One monster, from what `spec` says of it (see FIGURES): who he is, what he wears, how he stands, how he has rotted."""
    NAME = spec['name']
    body, rig = human(spec['macro'], spec['face'])
    eyes = wear(body, 'Eyes', 'eyes', 'low-poly', 'low-poly.mhclo')
    teeth = wear(body, 'Teeth', 'teeth', 'teeth_base', 'teeth_base.mhclo')
    suit = wear(body, 'Clothes', 'clothes', spec['suit'], spec['suit'] + '.mhclo') if spec.get('suit') else None
    shoes = wear(body, 'Clothes', 'clothes', 'shoes02', 'shoes02.mhclo') if spec.get('shoes', True) else None
    meshes = [o for o in (body, eyes, teeth, suit, shoes) if o]
    # His hands, closed on what he holds (done first, while they are as they were made: palms down, so that to curl
    # a finger is to turn its end downward). spec['grip']: for each hand, how far each joint of each finger bends
    # (degrees), and how far the hand is turned over (palm up) on his wrist.
    for side, (bend, over) in (spec.get('grip') or {}).items():
        P = lambda n: rig.matrix_world @ rig.pose.bones[f'{n}_{side}'].head
        knuckles = (P('index_01') - P('pinky_01')).normalized()
        finger = P('middle_02') - P('middle_01')
        way = 1 if (Matrix.Rotation(0.5, 3, knuckles) @ finger).z < finger.z else -1
        for f in ('index', 'middle', 'ring', 'pinky'):
            for n, deg in enumerate(bend, 1):
                turn(rig, f'{f}_0{n}_{side}', knuckles, way * deg)
        if over:
            along = (P('middle_01') - P('hand')).normalized()
            twist = 1 if (Matrix.Rotation(math.radians(over), 3, along) @ Vector((0, 0, -1))).z > 0 else -1
            turn(rig, f'lowerarm_{side}', along, twist * over * 0.5)
            turn(rig, f'hand_{side}', along, twist * over * 0.5)
    for name, axis, deg in spec['pose']:      # how he stands
        turn(rig, name, axis, deg)
    pivots = {'head': rig.matrix_world @ rig.pose.bones['head'].head, 'arm_l': rig.matrix_world @ rig.pose.bones['upperarm_l'].head, 'arm_r': rig.matrix_world @ rig.pose.bones['upperarm_r'].head,
              'leg_l': rig.matrix_world @ rig.pose.bones['thigh_l'].head, 'leg_r': rig.matrix_world @ rig.pose.bones['thigh_r'].head, 'body': Vector((0, 0, 0))}
    G = lambda v: (v.x, v.z, -v.y)           # (a point of Blender's, in the game's directions)
    spots = {'neck': G(rig.matrix_world @ rig.pose.bones['neck_01'].head), 'head': G(rig.matrix_world @ rig.pose.bones['head'].head)}
    for o in meshes:                       # the shape and the pose become what the mesh is
        only(o)
        if o.data.shape_keys:
            bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
        if o in (suit, shoes):
            sub = o.modifiers.new('round', 'SUBSURF')
            sub.levels = 1
            bpy.ops.object.modifier_move_to_index(modifier=sub.name, index=0)
        for mod in list(o.modifiers):
            if mod.type == 'MASK' and mod.vertex_group != 'body':   # (MakeHuman hides the skin under clothes this way: his are torn, so it is kept, and cut below. The mask called `body` hides its own scaffolding, and stays)
                o.modifiers.remove(mod)
                continue
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception:
                o.modifiers.remove(mod)
    # His clothes are torn: holes in the sleeves, a knee and the belly.
    if suit:
        bm = bmesh.new()
        bm.from_mesh(suit.data)
        mw = suit.matrix_world
        centres = np.array([list(mw @ f.calc_center_median()) for f in bm.faces])
        holes = spec['holes'](centres)
        bmesh.ops.delete(bm, geom=[f for f, h in zip(bm.faces, holes) if h], context='FACES')
        bm.to_mesh(suit.data)
        bm.free()
    if spec.get('legless'):                # a ghost: nothing of him below the hips but tatters
        bm = bmesh.new()
        bm.from_mesh(body.data)
        mw = body.matrix_world
        centres = np.array([list(mw @ f.calc_center_median()) for f in bm.faces])
        cut = float(pivots['leg_l'].z) + 0.02 - 0.22 * noise(centres * np.array([1, 1, 0.2]), 14, 2.0)
        bmesh.ops.delete(bm, geom=[f for f, c, k in zip(bm.faces, centres, cut) if c[2] < k], context='FACES')
        bm.to_mesh(body.data)
        bm.free()
    # Skin that is under what is left of them is cut away.
    trees = []
    for o in (suit, shoes):
        if o:
            mw = o.matrix_world
            trees.append(BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons]))
    mw, rot = body.matrix_world, body.matrix_world.to_3x3()
    hidden = {v.index for v in body.data.vertices if any(t.ray_cast(mw @ v.co + (rot @ v.normal).normalized() * 0.0005, (rot @ v.normal).normalized(), 0.04)[0] is not None for t in trees)}
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    deep = {i for i in hidden if all(e.other_vert(bm.verts[i]).index in hidden for e in bm.verts[i].link_edges)}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.index in deep for v in f.verts)], context='FACES')
    bm.to_mesh(body.data)
    bm.free()

    # ---- His colours ----
    lum = lambda c: (c @ np.array([0.3, 0.59, 0.11], dtype=np.float32))[:, None]
    blood, old_blood, mud, rot_c = np.array([0.42, 0.03, 0.02]), np.array([0.2, 0.03, 0.02]), np.array([0.2, 0.15, 0.09]), np.array([0.22, 0.27, 0.12])
    mix = lambda c, to, k: c * (1 - k[:, None]) + to * k[:, None]
    hp = world_points(body)
    gi = body.vertex_groups['head'].index
    on_head = np.array([any(g.group == gi and g.weight > 0.9 for g in v.groups) for v in body.data.vertices])
    fwd = (rig.matrix_world.to_3x3() @ rig.pose.bones['head'].matrix.to_3x3()) @ Vector((0, 0, 1))      # (a guess at which way his face points: checked below against where his nose is)
    cand = hp[on_head & (np.abs(hp[:, 0] - pivots['head'].x) < 0.05)]
    nose = Vector(cand[cand[:, 1].argmin()]) if len(cand) else pivots['head'] + Vector((0, -0.13, 0.09))
    print('NOSE', [round(v, 3) for v in nose])
    for o in meshes:
        c, P = bake(o)
        if o is body and spec.get('spectral'):
            # not flesh: something pale and cold, darker in its hollows, thinning to nothing where it ends
            c = lum(c) * np.array(spec['spectral']) * (0.75 + 0.5 * noise(P, 18, 1.0))[:, None] * 1.25
            sockets = np.linalg.norm((P - np.array(nose) - np.array([0, 0.02, 0.045])) * np.array([0.45, 1, 1]), axis=1)
            c = mix(c, np.array([0.02, 0.04, 0.05]), np.clip((0.04 - sockets) / 0.012, 0, 0.9))
            mouth = np.linalg.norm((P - np.array(nose) + np.array([0, -0.01, 0.055])) * np.array([0.8, 1, 0.7]), axis=1)
            c = mix(c, np.array([0.01, 0.02, 0.03]), np.clip((0.032 - mouth) / 0.01, 0, 0.95))
            c = c * np.clip((P[:, 2] - (float(pivots['leg_l'].z) - 0.25)) / 0.45, 0.25, 1)[:, None]
        elif o is body:
            c = (lum(c) * 0.75 + c * 0.25) * np.array(spec.get('skin', [0.78, 0.9, 0.72]))   # dead: grey, going green
            c = c * (0.72 + 0.5 * noise(P, 22, 1.0))[:, None]                           # mottled
            c = mix(c, rot_c, np.clip((noise(P, 7, 4.0) - 0.62) * 5, 0, 0.8))           # patches of rot
            d = np.linalg.norm(P - np.array(nose) + np.array([0, 0, 0.07]), axis=1)     # round his mouth and down his chin: blood
            c = mix(c, blood, np.clip((0.085 - d) / 0.03, 0, 0.9) * (0.5 + 0.5 * noise(P, 40, 2.0)))
            hands = np.clip((np.abs(P[:, 1] - (-0.45)) < 0.2).astype(np.float32) * (noise(P, 14, 5.0) - 0.45) * 4, 0, 0.85)
            c = mix(c, old_blood, hands * (P[:, 1] < -0.3))                             # and up his forearms
            sockets = np.linalg.norm((P - np.array(nose) - np.array([0, 0.02, 0.045])) * np.array([0.45, 1, 1]), axis=1)
            c = mix(c, np.array([0.05, 0.03, 0.04]), np.clip((0.034 - sockets) / 0.012, 0, 0.75))   # sunken, dark eyes
            if spec.get('gore'):                                                        # his belly, split open: wet and red, darker at its heart, running down him
                gut = np.array([0.0, float(pivots['leg_l'].y) - 0.3, float(pivots['leg_l'].z) + 0.2])
                d = np.linalg.norm((P - gut) * np.array([0.8, 0.6, 1.0]), axis=1) + 0.05 * (noise(P, 18, 3.3) - 0.5)
                c = mix(c, np.array([0.5, 0.04, 0.03]), np.clip((0.2 - d) / 0.05, 0, 0.95))
                c = mix(c, np.array([0.12, 0.0, 0.01]), np.clip((0.1 - d) / 0.04, 0, 0.9))
                run = (np.abs(P[:, 0] + 0.1 * (noise(P, 30, 1.1) - 0.5)) < 0.13) & (P[:, 2] < gut[2]) & (P[:, 1] < 0)
                c = mix(c, blood, run * np.clip(noise(P * np.array([6, 6, 1]), 9, 2.2) * 2 - 0.7, 0, 0.9))
                c = mix(c, old_blood, np.clip((noise(P, 5, 12.0) - 0.55) * 5, 0, 0.8))   # and old blood all over him
        elif o is suit and spec.get('cloth'):
            c = spec['cloth'](c, P, lum, mix, noise, blood, old_blood, mud)
            if spec.get('dealer'):   # his waistcoat: red, between the fronts of his jacket, a row of gold buttons down it
                nk, hip = rig.matrix_world @ rig.pose.bones['neck_01'].head, float(pivots['leg_l'].z)
                front = (P[:, 1] < nk.y - 0.04) & (P[:, 2] > hip + 0.06) & (P[:, 2] < nk.z - 0.1)
                open_ = np.abs(P[:, 0]) < 0.035 + 0.11 * np.clip((P[:, 2] - (hip + 0.06)) / (nk.z - 0.1 - hip - 0.06), 0, 1) ** 0.6 * 0.9
                vest = front & open_ & (lum(c)[:, 0] < 0.45)
                c[vest] = np.array([0.5, 0.04, 0.06]) * (0.75 + 0.5 * noise(P[vest], 30, 2.0))[:, None]
                button = vest & (np.abs(P[:, 0]) < 0.012) & (np.abs(((P[:, 2] - hip) % 0.075) - 0.037) < 0.012)
                c[button] = (0.9, 0.66, 0.15)
        elif o is suit:
            top = P[:, 2] > 0.98
            grey = lum(c)
            c = np.where(top[:, None], grey * np.array([0.62, 0.6, 0.5]) * 1.5, (grey * 0.6 + c * 0.4) * np.array([0.75, 0.78, 0.8]))
            c = c * (0.65 + 0.5 * noise(P, 16, 6.0))[:, None]
            c = mix(c, mud, np.clip((0.5 - P[:, 2]) / 0.4, 0, 1) * np.clip((noise(P, 11, 8.0) - 0.3) * 3, 0, 0.9))            # muck up his legs
            c = mix(c, old_blood, np.clip((noise(P, 6, 9.0) - 0.6) * 6, 0, 0.9) * top)                                      # blood down his front, dried
            c = mix(c, blood, np.clip((noise(P, 9, 3.1) - 0.7) * 12, 0, 0.85))                                             # ...and fresh round every tear
        elif o is shoes:
            c = mix(lum(c) * np.array([0.5, 0.45, 0.38]), mud, np.clip((noise(P, 20, 2.5) - 0.35) * 3, 0, 0.9))
        elif o is eyes:
            c[:] = (1.0, 0.92, 0.45)
        elif o is teeth:
            c = c * np.array([0.8, 0.72, 0.5])
        paint(o, c)

    # ---- Cut into the parts that swing ----
    out = []
    for o in meshes:
        groups = {g.index: g.name for g in o.vertex_groups}
        bones = set(b.name for b in rig.data.bones)
        dominant = []
        for v in o.data.vertices:
            best = max((g for g in v.groups if groups.get(g.group) in bones), key=lambda g: g.weight, default=None)
            dominant.append(part_of(groups[best.group]) if best else 'body')
        if not spec.get('head', True):
            dominant = ['body' if d == 'head' else d for d in dominant]
        if o is eyes:
            o.name = 'piece_eyes'
            out.append(('eyes', o))
            continue
        if o is teeth:
            dominant = ['head' if spec.get('head', True) else 'body'] * len(dominant)
        names = sorted(set(dominant))
        for name in names:
            only(o)
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_mode(type='FACE')
            bpy.ops.mesh.select_all(action='DESELECT')
            bpy.ops.object.mode_set(mode='OBJECT')
            n = 0
            for poly in o.data.polygons:
                votes = [dominant[i] for i in poly.vertices]
                poly.select = max(set(votes), key=votes.count) == name
                n += poly.select
            if not n:
                continue
            before = set(bpy.data.objects)
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.duplicate()
            bpy.ops.mesh.separate(type='SELECTED')
            bpy.ops.object.mode_set(mode='OBJECT')
            piece = next(iter(set(bpy.data.objects) - before), None)
            if piece:
                out.append((name, piece))
        bpy.data.objects.remove(o, do_unlink=True)
    # ---- A dealer's things (Babitus): what makes him the man who runs the tables ----
    # A red bow tie; a fan of cards held up in one hand; a stack of chips on the palm of the other.
    if spec.get('dealer'):
        def thing(op, colour, **kw):
            op(**kw)
            o = bpy.context.view_layer.objects.active
            only(o)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            bpy.ops.object.shade_smooth()
            paint(o, np.tile(np.array(colour, dtype=np.float32), (len(o.data.loops), 1)))
            return o
        W = rig.matrix_world
        headJ, neckJ = W @ rig.pose.bones['head'].head, W @ rig.pose.bones['neck_01'].head
        crown = headJ.z + 0.205               # (the top of his head)
        brow = crown - 0.095
        GREEN, RED, WHITE, BLACK, GOLD = (0.1, 0.75, 0.3), (0.75, 0.05, 0.07), (0.95, 0.93, 0.86), (0.04, 0.04, 0.05), (0.9, 0.66, 0.15)
        # the bow tie
        tie = (neckJ.x, neckJ.y - 0.075, neckJ.z + 0.005)
        for sd in (-1, 1):
            out.append(('body', thing(bpy.ops.mesh.primitive_cone_add, RED, radius1=0.032, radius2=0.006, depth=0.06, vertices=10, location=(tie[0] + sd * 0.034, tie[1], tie[2]), rotation=(0, sd * math.pi / 2, 0))))
        out.append(('body', thing(bpy.ops.mesh.primitive_uv_sphere_add, RED, radius=0.013, segments=10, ring_count=6, location=tie)))
        # the cards: five of them, fanned, faces to you, in his left hand
        def fist(part):   # the middle of a hand, and its top: found from the arm itself (what of it is furthest from the shoulder)
            P = np.concatenate([world_points(o) for n2, o in out if n2 == part])
            far = P[np.linalg.norm(P - np.array(pivots[part]), axis=1).argmax()]
            near = P[np.linalg.norm(P - far, axis=1) < 0.085]
            return Vector(near.mean(0)), float(near[:, 2].max()), float(near[:, 1].min())
        mid_l, top_l, front_l = fist('arm_l')
        hand = Vector((mid_l.x, front_l + 0.022, mid_l.z - 0.03))   # (through his closed fist, a little in front of his knuckles' line)
        for i in range(5):
            a = (i - 2) * 0.24
            card = thing(bpy.ops.mesh.primitive_cube_add, WHITE, size=1, location=(0, 0, 0))
            card.data.transform(Matrix.Translation((hand.x, hand.y - 0.03 - i * 0.003, hand.z + 0.02)) @ Matrix.Rotation(a, 4, 'Y') @ Matrix.Translation((0, 0, 0.085)) @ Matrix.Scale(0.085, 4, (1, 0, 0)) @ Matrix.Scale(0.004, 4, (0, 1, 0)) @ Matrix.Scale(0.125, 4, (0, 0, 1)))
            out.append(('arm_l', card))
            for k, (dx, dz) in enumerate([(-0.027, 0.045), (0.027, -0.045), (0, 0)]):     # its pips: red or black, in two corners and the middle
                pip = thing(bpy.ops.mesh.primitive_cylinder_add, RED if i % 2 else BLACK, radius=0.009 if k < 2 else 0.018, depth=0.002, vertices=4 if i % 2 else 12, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
                pip.data.transform(Matrix.Translation((hand.x, hand.y - 0.034 - i * 0.003, hand.z + 0.02)) @ Matrix.Rotation(a, 4, 'Y') @ Matrix.Translation((dx, 0, 0.085 + dz)))
                out.append(('arm_l', pip))
        # the chips: a stack of them, standing on his right palm
        mid_r, top_r, front_r = fist('arm_r')
        palm = Vector((mid_r.x, mid_r.y + 0.02, top_r - 0.034))     # (standing on the top of his hand)
        for i in range(9):
            chip = thing(bpy.ops.mesh.primitive_cylinder_add, [RED, WHITE, GREEN, BLACK, GOLD][i % 5], radius=0.034, depth=0.0085, vertices=20, location=(palm.x + 0.004 * math.sin(i * 2.1), palm.y - 0.02 + 0.004 * math.cos(i * 1.7), palm.z + 0.03 + i * 0.0095))
            out.append(('arm_r', chip))
            out.append(('arm_r', thing(bpy.ops.mesh.primitive_torus_add, WHITE if i % 5 != 1 else RED, major_radius=0.034, minor_radius=0.0025, major_segments=20, minor_segments=4, location=(palm.x + 0.004 * math.sin(i * 2.1), palm.y - 0.02 + 0.004 * math.cos(i * 1.7), palm.z + 0.03 + i * 0.0095))))

    made = []
    for name in ('body', 'head', 'eyes', 'arm_l', 'arm_r', 'leg_l', 'leg_r'):
        pieces = [o for n, o in out if n == name]
        if not pieces:
            continue
        if 'index' in spec and name not in spec['index']:
            for o in pieces:
                bpy.data.objects.remove(o, do_unlink=True)
            continue
        label = f"p{spec['index'][name]}" if 'index' in spec else name
        for o in bpy.data.objects:
            o.select_set(o in pieces)
        bpy.context.view_layer.objects.active = pieces[0]
        if len(pieces) > 1:
            bpy.ops.object.join()
        o = pieces[0]
        only(o)
        o.vertex_groups.clear()
        o.data.materials.clear()
        bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        pivot = (pivots['head'] if spec.get('head', True) else pivots['body']) if name == 'eyes' else pivots[name]
        o.data.transform(Matrix.Translation(-pivot))
        o.location = pivot
        o.name = f'{NAME}_{label}'
        o.location.z -= spec.get('drop', 0)
        if name != 'eyes':
            only(o)
            mod = o.modifiers.new('thin', 'DECIMATE')
            mod.ratio = spec.get('keep', 0.55)
            bpy.ops.object.modifier_apply(modifier=mod.name)
        made.append(o)
        if not spec.get('lite', True):
            continue
        # ...and a thinned-out copy, for when he is far away.
        only(o)
        bpy.ops.object.duplicate()
        lite = bpy.context.view_layer.objects.active
        lite.name = f'{NAME}_lite_{label}'
        mod = lite.modifiers.new('thin', 'DECIMATE')
        mod.ratio = 0.22 if name != 'eyes' else 1.0
        bpy.ops.object.modifier_apply(modifier=mod.name)
        made.append(lite)
    bpy.data.objects.remove(rig, do_unlink=True)
    if spec.get('gold'):
        top = max((o.location.z + max((v.co.z for v in o.data.vertices), default=0)) for o in made if o.name.endswith('_body'))   # (the top of his head)
        made += jewels(spots['neck'], (spots['head'][0], top, spots['head'][2] + 0.03))
    return made


# ---- Creatures: not people, so not MakeHuman's. Each is drawn as a skeleton of points with a thickness at each
# (Blender's Skin modifier wraps a body round them, and Subdivision rounds it off), then roughed up into fur and
# coloured. They are written in the game's own directions (x right, y up, z forward: B() turns that into Blender's),
# and made to the sizes and pivots of the built ones they replace, part for part (<monster>_p<n> replaces part n).
B = lambda p: (p[0], -p[2], p[1])
G = lambda P: np.stack([P[:, 0], P[:, 2], -P[:, 1]], 1)


def skinned(pts, radii, edges=None, sub=2):
    mesh = bpy.data.meshes.new('skin')
    mesh.from_pydata([B(p) for p in pts], edges or [(i, i + 1) for i in range(len(pts) - 1)], [])
    o = bpy.data.objects.new('skin', mesh)
    bpy.context.scene.collection.objects.link(o)
    o.modifiers.new('skin', 'SKIN')
    for v, r in zip(mesh.skin_vertices[0].data, radii):
        v.radius = (r, r) if not isinstance(r, tuple) else r
        v.use_root = False
    mesh.skin_vertices[0].data[0].use_root = True
    if sub:
        o.modifiers.new('sub', 'SUBSURF').levels = sub
    only(o)
    for mod in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o


def ball(at, radii, segments=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=B(at), segments=segments, ring_count=max(6, segments * 5 // 8))
    o = bpy.context.view_layer.objects.active
    o.scale = (radii[0], radii[2], radii[1])
    only(o)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return o


def creature_part(name, pieces, pivot, colour, fur=0.0, lite=0.25, fine=(), fine_colour=(0.72, 0.7, 0.64), keep=None):
    """Join pieces into one part, rough it up, colour it (colour(points in the game's directions, normals) -> colours), sit it at its pivot."""
    for o in bpy.data.objects:
        o.select_set(o in pieces)
    bpy.context.view_layer.objects.active = pieces[0]
    if len(pieces) > 1:
        bpy.ops.object.join()
    o = pieces[0]
    only(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.shade_smooth()
    mesh = o.data
    n = len(mesh.vertices)
    co = np.empty(n * 3); mesh.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    no = np.empty(n * 3); mesh.vertices.foreach_get('normal', no); no = no.reshape(-1, 3)
    if fur:                                   # clumps of hair: every point pushed out by a different amount, and swept back
        k = fur * (noise(co, 55, 1.0) * 0.6 + noise(co, 140, 2.0) * 0.7 - 0.35)
        co = co + no * k[:, None] + np.array([0, 1, 0]) * (np.abs(k) * 0.6)[:, None]
        mesh.vertices.foreach_set('co', co.ravel())
        mesh.update()
    cv = colour(G(co), G(no)).astype(np.float32)
    if 'dark' in o.vertex_groups:             # hollows (an eye socket, a nose): nearly black
        gi = o.vertex_groups['dark'].index
        for v in mesh.vertices:
            if any(g.group == gi and g.weight > 0.5 for g in v.groups):
                cv[v.index] *= 0.07
    if fine:                                  # whiskers and the like: too thin to be roughed up with the rest, so they go on afterwards
        for ob in bpy.data.objects:
            ob.select_set(ob is o or ob in fine)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.join()
        only(o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        mesh = o.data
        cv = np.concatenate([cv, np.tile(np.array(fine_colour, dtype=np.float32), (len(mesh.vertices) - n, 1))])
    which = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get('vertex_index', which)
    paint(o, cv[which])
    mesh.transform(Matrix.Translation(-Vector(B(pivot))))
    o.location = B(pivot)
    o.name = name
    if keep or (lite and lite < 1):           # (thinned to what the game can draw a pack of)
        only(o)
        mod = o.modifiers.new('thin', 'DECIMATE')
        mod.ratio = keep or 0.5
        bpy.ops.object.modifier_apply(modifier=mod.name)
    out = [o]
    if lite:
        only(o)
        bpy.ops.object.duplicate()
        thin = bpy.context.view_layer.objects.active
        thin.name = name.replace('_p', '_lite_p')
        mod = thin.modifiers.new('thin', 'DECIMATE')
        mod.ratio = lite
        bpy.ops.object.modifier_apply(modifier=mod.name)
        out.append(thin)
    return out


def rat():
    """A sewer rat the size of a dog: hunched, mangy, wet-furred, with a bare pink tail and feet and blood on its muzzle."""
    fur_c, belly, pink, bare = np.array([0.16, 0.13, 0.11]), np.array([0.3, 0.26, 0.22]), np.array([0.5, 0.33, 0.31]), np.array([0.42, 0.25, 0.24])
    def coat(P, N):
        c = np.tile(fur_c, (len(P), 1)) * (0.6 + 0.9 * noise(P, 60, 3.0))[:, None]
        c = c * (1 - 0.35 * (noise(P * np.array([4, 4, 1]), 50, 5.0) > 0.6))[:, None]                 # streaks, along the lie of the hair
        low = np.clip((0.3 - P[:, 1]) / 0.12, 0, 1)
        c = c * (1 - low[:, None]) + belly * low[:, None]                                            # paler underneath
        mange = np.clip((noise(P, 9, 7.0) - 0.66) * 9, 0, 0.9)
        c = c * (1 - mange[:, None]) + bare * mange[:, None]                                         # bald patches
        snout = np.clip((P[:, 2] - 0.56) / 0.08, 0, 1)
        c = c * (1 - snout[:, None]) + pink * snout[:, None]
        gore = np.clip((P[:, 2] - 0.5) / 0.1, 0, 1) * np.clip((0.33 - P[:, 1]) / 0.05, 0, 1)
        return c * (1 - gore[:, None]) + np.array([0.4, 0.03, 0.02]) * gore[:, None]                 # what it has been eating
    skin_c = lambda P, N: np.tile(pink, (len(P), 1)) * (0.7 + 0.5 * noise(P, 40, 2.0))[:, None] * (0.75 + 0.25 * (np.sin(P[:, 2] * 260) > 0))[:, None]   # (ringed, like a rat's tail)
    made = []
    body = skinned([(0, 0.27, 0.69), (0, 0.3, 0.6), (0, 0.36, 0.48), (0, 0.37, 0.36), (0, 0.39, 0.2), (0, 0.4, 0.0), (0, 0.42, -0.2), (0, 0.33, -0.38),
                    (0.09, 0.46, 0.42), (0.13, 0.55, 0.4), (-0.09, 0.46, 0.42), (-0.13, 0.55, 0.4)],
                   [0.022, 0.055, 0.105, 0.12, 0.165, 0.205, 0.19, 0.1, 0.03, (0.05, 0.012), 0.03, (0.05, 0.012)],
                   edges=[(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 7), (2, 8), (8, 9), (2, 10), (10, 11)])
    teeth = [skinned([(sd * 0.012, 0.25, 0.66), (sd * 0.012, 0.2, 0.665)], [0.009, 0.004], sub=1) for sd in (-1, 1)]
    whiskers = [skinned([(sd * 0.04, 0.3 + k * 0.012, 0.62), (sd * (0.2 + 0.02 * k), 0.27 + k * 0.035, 0.58 + 0.02 * k)], [0.003, 0.001], sub=0) for sd in (-1, 1) for k in range(4)]
    def body_c(P, N):
        c = coat(P, N)
        tooth = (P[:, 1] < 0.262) & (P[:, 2] > 0.645) & (np.abs(P[:, 0]) < 0.03)
        c[tooth] = (0.8, 0.72, 0.45)
        ear = (P[:, 1] > 0.47) & (np.abs(P[:, 0]) > 0.07) & (P[:, 2] > 0.3)
        c[ear] = pink * 0.85
        c[(np.abs(P[:, 0]) > 0.05) & (P[:, 2] > 0.555) & (P[:, 1] < 0.42) & (np.abs(N[:, 2]) < 0.5) & (np.abs(P[:, 0]) > 0.075)] = (0.75, 0.72, 0.66)   # whiskers
        return c
    made += creature_part('rat_p0', [body] + teeth, (0, 0, 0), body_c, fur=0.022, fine=whiskers)
    made += creature_part('rat_p1', [ball((sd * 0.078, 0.4, 0.535), (0.02, 0.02, 0.02), 10) for sd in (-1, 1)], (0, 0, 0), lambda P, N: np.tile(np.array([1.0, 0.25, 0.1]), (len(P), 1)), lite=1.0)
    made += creature_part('rat_p2', [skinned([(0, 0.3, -0.38), (0, 0.22, -0.56), (0.03, 0.11, -0.78), (-0.02, 0.07, -0.98), (0.01, 0.1, -1.11)], [0.036, 0.027, 0.019, 0.012, 0.005])], (0, 0.24, -0.36), skin_c)
    for i, (sd, z) in enumerate([(-1, 0.22), (1, 0.22), (-1, -0.22), (1, -0.22)]):
        x = sd * 0.15
        leg = skinned([(x, 0.24, z), (x * 1.08, 0.12, z - 0.02 if z < 0 else z + 0.02), (x * 1.1, 0.035, z + 0.03), (x * 1.1, 0.012, z + 0.11)], [0.062 if z < 0 else 0.05, 0.036, 0.022, 0.014])
        toes = [skinned([(x * 1.1 + t * 0.016, 0.014, z + 0.1), (x * 1.1 + t * 0.03, 0.006, z + 0.145)], [0.008, 0.003], sub=1) for t in (-1, 0, 1)]
        def leg_c(P, N):
            c = coat(P, N)
            foot = np.clip((0.09 - P[:, 1]) / 0.04, 0, 1)
            return c * (1 - foot[:, None]) + pink * foot[:, None]
        made += creature_part(f'rat_p{3 + i}', [leg] + toes, (x, 0.2, z), leg_c, fur=0.012)
    return made


def crawler():
    """A spider as big as a pig: a swollen, bristling abdomen with a red hourglass on it, a low armoured head with fangs under it, eight long jointed legs."""
    dark, shell, hair, mark, fang = np.array([0.05, 0.04, 0.035]), np.array([0.1, 0.075, 0.06]), np.array([0.2, 0.15, 0.11]), np.array([0.55, 0.05, 0.04]), np.array([0.7, 0.65, 0.5])
    def body_c(P, N):
        c = np.tile(shell, (len(P), 1)) * (0.5 + 1.0 * noise(P, 45, 1.0))[:, None]
        bristle = np.clip((noise(P, 150, 4.0) - 0.55) * 5, 0, 1)
        c = c * (1 - 0.6 * bristle[:, None]) + hair * 0.6 * bristle[:, None]
        back = (P[:, 2] < -0.1) & (N[:, 1] > 0.35)
        hour = back & (np.abs(P[:, 0]) < 0.035 + 0.5 * np.abs(P[:, 2] + 0.42)) & (np.abs(P[:, 2] + 0.42) < 0.17)
        c[hour] = mark * (0.8 + 0.4 * noise(P[hour], 30, 2.0))[:, None]
        under = np.clip((0.33 - P[:, 1]) / 0.1, 0, 1)
        c = c * (1 - 0.5 * under[:, None])
        tip = (P[:, 1] < 0.3) & (P[:, 2] > 0.4)
        c[tip] = fang
        return c
    def leg_c(P, N):
        c = np.tile(dark, (len(P), 1)) * (0.6 + 1.2 * noise(P, 50, 3.0))[:, None]
        r = np.sqrt(P[:, 0] ** 2 + (P[:, 2]) ** 2)
        band = (np.sin(r * 42) > 0.72)
        c[band] = hair * 1.1                                         # paler bands at the joints
        bristle = np.clip((noise(P, 170, 6.0) - 0.6) * 6, 0, 1)
        return c * (1 - 0.5 * bristle[:, None]) + hair * 0.5 * bristle[:, None]
    made = []
    body = skinned([(0, 0.48, -0.74), (0, 0.56, -0.5), (0, 0.55, -0.28), (0, 0.46, -0.08), (0, 0.44, 0.12), (0, 0.43, 0.32), (0, 0.4, 0.42)], [0.13, 0.31, 0.3, 0.12, 0.2, 0.16, 0.09])
    fangs = [skinned([(sd * 0.06, 0.38, 0.44), (sd * 0.06, 0.29, 0.5), (sd * 0.035, 0.21, 0.5), (sd * 0.02, 0.19, 0.46)], [0.045, 0.032, 0.014, 0.004]) for sd in (-1, 1)]
    palps = [skinned([(sd * 0.11, 0.4, 0.4), (sd * 0.16, 0.36, 0.52), (sd * 0.13, 0.26, 0.56)], [0.03, 0.022, 0.012]) for sd in (-1, 1)]
    spinner = [skinned([(sd * 0.04, 0.44, -0.8), (sd * 0.05, 0.38, -0.86)], [0.03, 0.012], sub=1) for sd in (-1, 1)]
    made += creature_part('crawler_p0', [body] + fangs + palps + spinner, (0, 0, 0), body_c, fur=0.03)
    eyes = [ball(p, (r, r, r), 10) for p, r in [((0.035, 0.5, 0.44), 0.024), ((-0.035, 0.5, 0.44), 0.024), ((0.085, 0.49, 0.4), 0.018), ((-0.085, 0.49, 0.4), 0.018),
                                                ((0.05, 0.535, 0.38), 0.014), ((-0.05, 0.535, 0.38), 0.014), ((0.105, 0.52, 0.33), 0.012), ((-0.105, 0.52, 0.33), 0.012)]]
    made += creature_part('crawler_p1', eyes, (0, 0, 0), lambda P, N: np.tile(np.array([1.0, 0.12, 0.06]), (len(P), 1)), lite=1.0)
    feet = [0.82, 0.3, -0.22, -0.72]
    i = 2
    for k, zk in enumerate([0.2, 0.09, -0.02, -0.13]):
        for sd in (-1, 1):
            fz = feet[k]
            mid = lambda t: zk + (fz - zk) * t
            leg = skinned([(sd * 0.15, 0.42, zk), (sd * 0.26, 0.56, mid(0.15)), (sd * 0.44, 0.84, mid(0.4)), (sd * 0.62, 0.62, mid(0.68)), (sd * 0.8, 0.26, mid(0.9)), (sd * 0.89, 0.01, fz)],
                          [0.05, 0.042, 0.04, 0.03, 0.022, 0.006])
            made += creature_part(f'crawler_p{i}', [leg], (sd * 0.15, 0.42, zk), leg_c, fur=0.016)
            i += 1
    return made


# ---- Bones: the skeleton, the bone-thrower and Rubistus are made of these ----
def cut(o, cutters):
    """Bite the cutters' shapes out of `o` (eye sockets, a nose hole), and mark what is left of the bite as dark."""
    centres = [(np.array(c.location), max(c.dimensions) / 2) for c in cutters]
    for c in cutters:
        mod = o.modifiers.new('cut', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = c
        only(o)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(c, do_unlink=True)
    group = o.vertex_groups.new(name='dark')
    for v in o.data.vertices:
        if any(np.linalg.norm(np.array(v.co) - at) < r * 1.04 for at, r in centres):
            group.add([v.index], 1.0, 'REPLACE')
    return o


_skull = None


def skull(at, size=1.0, turn=(0, 0, 0), jaw=0.0):
    """A human skull, its middle at `at` (the game's directions), `size` times life size, turned (pitch, yaw, roll: rad), its jaw dropped by `jaw`."""
    global _skull
    if _skull is None:
        dome = ball((0, 0, 0), (0.082, 0.095, 0.105), 24)
        face = ball((0, -0.062, 0.058), (0.056, 0.05, 0.052), 16)
        cheeks = [skinned([(sd * 0.078, -0.03, 0.0), (sd * 0.076, -0.04, 0.06), (sd * 0.05, -0.05, 0.095)], [0.011, 0.012, 0.012], sub=1) for sd in (-1, 1)]
        brow = skinned([(-0.065, 0.022, 0.085), (0, 0.03, 0.103), (0.065, 0.022, 0.085)], [0.014, 0.012, 0.014], sub=1)
        # (each bitten on its own, before they are joined: the bite goes wrong on shells that run through each other)
        for shell, cutters in ((dome, [ball((sd * 0.035, -0.012, 0.092), (0.029, 0.03, 0.04), 12) for sd in (-1, 1)]), (face, [ball((0, -0.056, 0.108), (0.013, 0.024, 0.03), 10), ball((0.035, -0.012, 0.092), (0.029, 0.03, 0.04), 12), ball((-0.035, -0.012, 0.092), (0.029, 0.03, 0.04), 12)])):
            only(shell)
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            cut(shell, cutters)
        for o in bpy.data.objects:
            o.select_set(o in [dome, face, brow] + cheeks)
        bpy.context.view_layer.objects.active = dome
        bpy.ops.object.join()
        teeth = [skinned([(0.04 * math.sin(a), -0.098, 0.06 + 0.045 * math.cos(a)), (0.04 * math.sin(a), -0.118, 0.06 + 0.045 * math.cos(a))], [0.0075, 0.006], sub=0) for a in np.linspace(-1.25, 1.25, 9)]
        for o in bpy.data.objects:
            o.select_set(o is dome or o in teeth)
        bpy.context.view_layer.objects.active = dome
        bpy.ops.object.join()
        mandible = skinned([(-0.068, -0.05, -0.01), (-0.062, -0.125, 0.005), (-0.035, -0.148, 0.075), (0, -0.152, 0.098), (0.035, -0.148, 0.075), (0.062, -0.125, 0.005), (0.068, -0.05, -0.01)], [0.012, 0.014, 0.013, 0.015, 0.013, 0.014, 0.012], sub=1)
        low = [skinned([(0.037 * math.sin(a), -0.138, 0.058 + 0.042 * math.cos(a)), (0.037 * math.sin(a), -0.122, 0.058 + 0.042 * math.cos(a))], [0.007, 0.0055], sub=0) for a in np.linspace(-1.1, 1.1, 7)]
        for o in bpy.data.objects:
            o.select_set(o is mandible or o in low)
        bpy.context.view_layer.objects.active = mandible
        bpy.ops.object.join()
        dome.name, mandible.name = 'skull_base', 'jaw_base'
        for o in (dome, mandible):
            o.hide_render = True
        _skull = (dome, mandible)
    out = []
    for base, drop in ((_skull[0], 0.0), (_skull[1], jaw)):
        only(base)
        bpy.ops.object.duplicate()
        o = bpy.context.view_layer.objects.active
        o.hide_render = False
        o.name = 'skull'
        if drop:                                  # the jaw hangs open: turned about its hinge
            hinge = Vector(B((0, -0.05, -0.01)))
            o.data.transform(Matrix.Translation(hinge) @ Matrix.Rotation(-drop, 4, 'X') @ Matrix.Translation(-hinge))
        o.data.transform(Matrix.Translation(Vector(B(at))) @ Matrix.Rotation(turn[1], 4, 'Z') @ Matrix.Rotation(-turn[0], 4, 'X') @ Matrix.Rotation(turn[2], 4, 'Y') @ Matrix.Scale(size, 4))
        out.append(o)
    return out


def bone(a, b, r, knob=1.7, sub=1):
    """A long bone from a to b: a shaft, with a knuckle at each end."""
    a, b = np.array(a, dtype=float), np.array(b, dtype=float)
    return skinned([tuple(a), tuple(a + (b - a) * 0.12), tuple(a + (b - a) * 0.88), tuple(b)], [r * knob, r, r, r * knob], sub=sub)


def hand_bones(wrist, toward, size=1.0, curl=0.5, side=1):
    """The bones of a hand from the wrist: four fingers and a thumb, three joints each, curling."""
    w, t = np.array(wrist, dtype=float), np.array(toward, dtype=float)
    t /= np.linalg.norm(t)
    across = np.cross(t, [0, 1, 0]); across /= (np.linalg.norm(across) or 1)
    down = np.cross(across, t)
    out = []
    for i, spread in enumerate((-1.5, -0.5, 0.5, 1.5)):
        p0 = w + across * spread * 0.014 * size
        p1 = p0 + (t + across * spread * 0.12) * 0.07 * size
        p2 = p1 + (t - down * curl * 0.6) * 0.04 * size
        p3 = p2 + (t - down * curl * 1.4) * 0.03 * size
        out.append(skinned([tuple(p0), tuple(p1), tuple(p2), tuple(p3)], [0.0075 * size, 0.0085 * size, 0.007 * size, 0.004 * size], sub=1))
    p0 = w + across * side * 0.02 * size
    out.append(skinned([tuple(p0), tuple(p0 + (t * 0.5 + across * side) * 0.04 * size), tuple(p0 + (t * 1.2 + across * side * 1.2 - down * curl) * 0.05 * size)], [0.008 * size, 0.008 * size, 0.004 * size], sub=1))
    return out


def ribcage(top, bottom, half, depth, ribs=10):
    """Spine, ribs and breastbone between two heights: the ribs widest two-thirds of the way down."""
    out = []
    n = 14
    spine = [(0, bottom - 0.24 + (top + 0.1 - bottom + 0.24) * i / (n - 1), -depth * 0.55 + 0.03 * math.sin(i / (n - 1) * math.pi)) for i in range(n)]
    out.append(skinned(spine, [0.022 if i % 2 else 0.014 for i in range(n)], sub=1))
    for i in range(ribs):
        t = i / (ribs - 1)
        y = top - (top - bottom) * t
        w = half * (0.55 + 0.45 * math.sin(min(1.0, t * 1.5) * math.pi / 2)) * (1 - 0.25 * max(0, t - 0.75) * 4)
        for sd in (-1, 1):
            pts = [(0, y + 0.02, -depth * 0.5), (sd * w * 0.7, y + 0.02, -depth * 0.75), (sd * w, y - 0.02, -depth * 0.1), (sd * w * 0.75, y - 0.06, depth * 0.75)]
            if t < 0.72:
                pts.append((sd * 0.02, y - 0.05, depth))
            out.append(skinned(pts, [0.009] * len(pts), sub=1))
    out.append(skinned([(0, top - 0.02, depth), (0, top - (top - bottom) * 0.72, depth * 1.05)], [(0.022, 0.009), (0.014, 0.008)], sub=1))
    return out


def bone_colour(tint=(0.8, 0.76, 0.62), blood=0.0):
    def colour(P, N):
        c = np.tile(np.array(tint), (len(P), 1)) * (0.62 + 0.55 * noise(P, 30, 1.0))[:, None]
        c = c * (0.78 + 0.22 * np.clip(N[:, 1] + 0.6, 0, 1))[:, None]                                   # darker underneath
        stain = np.clip((noise(P, 8, 5.0) - 0.6) * 6, 0, 0.7)
        c = c * (1 - stain[:, None]) + np.array([0.3, 0.25, 0.13]) * stain[:, None]                    # old, stained
        if blood:
            wet = np.clip((noise(P, 6, 9.0) - (1 - blood)) * 8, 0, 0.9)
            c = c * (1 - wet[:, None]) + np.array([0.32, 0.03, 0.02]) * wet[:, None]
        return c
    return colour


def skeleton_arm(sd, shoulder, elbow, wrist, toward, r=0.013, curl=0.5):
    e, w = np.array(elbow, dtype=float), np.array(wrist, dtype=float)
    off = np.array([0.012 * sd, 0, 0.004])
    return [bone(shoulder, elbow, r), bone(tuple(e + off), tuple(w + off), r * 0.62, 1.5), bone(tuple(e - off), tuple(w - off), r * 0.7, 1.5)] + hand_bones(wrist, toward, 1.0, curl, sd)


def skeleton_leg(sd, hip, knee, ankle, r=0.016):
    k, a = np.array(knee, dtype=float), np.array(ankle, dtype=float)
    foot = [skinned([tuple(a + [0, -0.03, -0.04]), tuple(a + [0, -0.055, 0.0])], [0.022, 0.018], sub=1)]
    for i, t in enumerate((-1.5, -0.5, 0.5, 1.5, 2.3)):
        p = a + [sd * -t * 0.011, -0.05, 0.02]
        foot.append(skinned([tuple(p), tuple(p + [sd * -t * 0.006, -0.012, 0.09]), tuple(p + [sd * -t * 0.008, -0.022, 0.14 - 0.01 * abs(t)])], [0.008, 0.0065, 0.004], sub=1))
    return [bone(hip, knee, r, 1.8), bone(tuple(k + [0, 0, 0.012]), tuple(a + [0, 0, 0.012]), r * 0.85, 1.6), bone(tuple(k + [sd * 0.022, -0.02, -0.01]), tuple(a + [sd * 0.02, 0.02, -0.01]), r * 0.45, 1.4),
            ball(tuple(k + [0, 0, 0.035]), (0.02, 0.024, 0.012), 8)] + foot


def pelvis(y, half):
    wings = [skinned([(0, y + 0.06, -0.05), (sd * half * 0.9, y + 0.13, -0.045), (sd * half * 1.25, y + 0.07, 0.01), (sd * half * 0.9, y - 0.02, 0.05), (sd * 0.02, y - 0.05, 0.065)],
                     [0.02, (0.03, 0.012), (0.034, 0.012), 0.016, 0.014], sub=1) for sd in (-1, 1)]
    return wings + [skinned([(0, y + 0.08, -0.06), (0, y - 0.04, -0.075), (0, y - 0.1, -0.05)], [0.026, 0.02, 0.008], sub=1)]


def rattler():
    """The skeleton: a whole one, yellowed and stained, its jaw hanging, its arms out for you."""
    made = []
    body = skull((0, 1.69, 0.03), 0.95, (0.12, 0.1, 0.05), jaw=0.35) + ribcage(1.47, 1.14, 0.17, 0.11) + pelvis(0.92, 0.1)
    body += [bone((0.02 * sd, 1.48, 0.1), (sd * 0.21, 1.49, 0.0), 0.009, 1.5) for sd in (-1, 1)]
    body += [ball((sd * 0.12, 1.4, -0.1), (0.042, 0.06, 0.008), 10) for sd in (-1, 1)]
    made += creature_part('rattler_p0', body, (0, 0, 0), bone_colour(blood=0.12), lite=0.3)
    made += creature_part('rattler_p1', [ball((sd * 0.033, 1.68, 0.105), (0.014, 0.014, 0.014), 8) for sd in (-1, 1)], (0, 0, 0), lambda P, N: np.tile(np.array([0.5, 1.0, 0.75]), (len(P), 1)), lite=1.0)
    for i, sd in enumerate((-1, 1)):
        made += creature_part(f'rattler_p{2 + i}', skeleton_arm(sd, (sd * 0.21, 1.47, 0), (sd * 0.22, 1.2, 0.04), (sd * 0.2, 1.12, 0.26), (0, -0.25, 1), curl=0.9), (sd * 0.21, 1.47, 0), bone_colour(blood=0.3), lite=0.3)
        made += creature_part(f'rattler_p{4 + i}', skeleton_leg(sd, (sd * 0.1, 0.9, 0), (sd * 0.1, 0.49, 0.03), (sd * 0.1, 0.075, 0.0)), (sd * 0.1, 0.9, 0), bone_colour(), lite=0.3)
    return made


def thrower():
    """The bone-thrower: a skeleton in a rotten robe and hood, a sack of bones on its back, one arm cocked back with a thigh bone in its fist."""
    robe_c = np.array([0.2, 0.16, 0.125])
    def cloth(P, N):
        c = np.tile(robe_c, (len(P), 1)) * (0.55 + 0.9 * noise(P, 14, 2.0))[:, None]
        a = np.arctan2(P[:, 2], P[:, 0])
        c = c * (0.8 + 0.2 * np.sin(a * 11 + 3 * noise(P, 3, 1.0)))[:, None]                             # the folds, dark in their depths
        muck = np.clip((0.55 - P[:, 1]) / 0.5, 0, 1) * np.clip((noise(P, 10, 4.0) - 0.3) * 3, 0, 0.9)
        return c * (1 - muck[:, None]) + np.array([0.2, 0.17, 0.11]) * muck[:, None]
    def robe_shape(o):
        co = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        a = np.arctan2(co[:, 1], co[:, 0]); r = np.hypot(co[:, 0], co[:, 1])
        k = 1 + 0.16 * np.sin(a * 11 + co[:, 2] * 2.5) * np.clip(1.3 - co[:, 2], 0.2, 1) + 0.05 * np.sin(co[:, 2] * 19 + a * 3) * (co[:, 2] < 0.25)   # folds, and a ragged hem
        co[:, 0] *= k; co[:, 1] *= k
        o.data.vertices.foreach_set('co', co.ravel())
        return o
    robe = robe_shape(skinned([(0, 0.58, 0), (0, 0.72, 0), (0, 0.9, 0.01), (0, 1.1, 0.04), (0, 1.34, 0.08), (0, 1.47, 0.11)], [0.3, 0.28, 0.25, 0.215, 0.2, 0.13], sub=3))   # (to his knees: his shins show under it, and he walks on them)
    hood = cut(ball((0, 1.63, 0.1), (0.15, 0.17, 0.18), 20), [ball((0, 1.6, 0.27), (0.105, 0.125, 0.14), 14)])
    for g in list(hood.vertex_groups):
        hood.vertex_groups.remove(g)
    sack = ball((0, 1.08, -0.33), (0.26, 0.3, 0.22), 18)
    made = []
    def body_c(P, N):
        c = cloth(P, N)
        head = (np.linalg.norm((P - np.array([0, 1.6, 0.16])) * np.array([1, 0.9, 1]), axis=1) < 0.118) & (P[:, 2] > 0.05)
        c[head] = bone_colour()(P[head], N[head])
        bag = (P[:, 2] < -0.14) & (P[:, 1] > 0.75) & (P[:, 1] < 1.42)
        c[bag] = np.array([0.33, 0.27, 0.17]) * (0.6 + 0.8 * noise(P[bag], 26, 3.0))[:, None]
        poking = bag & (P[:, 1] > 1.36)
        c[poking] = bone_colour()(P[poking], N[poking])
        return c
    spill = [bone((0.08 * math.sin(i * 2.4), 1.33, -0.33 + 0.08 * math.cos(i * 2.4)), (0.14 * math.sin(i * 2.4), 1.5 + 0.04 * (i % 2), -0.36 + 0.12 * math.cos(i * 2.4)), 0.012) for i in range(5)]
    rope = [skinned([(0.2 * sd, 1.42, 0.02), (0.22 * sd, 1.3, -0.14), (0.2 * sd, 1.2, -0.3)], [0.012, 0.012, 0.012], sub=1) for sd in (-1, 1)]
    made += creature_part('thrower_p0', [robe, hood, sack] + skull((0, 1.6, 0.16), 0.95, (0.15, 0, 0), jaw=0.25) + spill + rope, (0, 0, 0), body_c, lite=0.25)
    made += creature_part('thrower_p1', [ball((sd * 0.033, 1.59, 0.235), (0.015, 0.015, 0.015), 8) for sd in (-1, 1)], (0, 0, 0), lambda P, N: np.tile(np.array([0.55, 1.0, 0.35]), (len(P), 1)), lite=1.0)
    # the arm that throws: up and back, a thigh bone in its fist; a rag of sleeve on it
    up = skeleton_arm(1, (0.27, 1.42, 0), (0.33, 1.68, -0.14), (0.3, 1.9, -0.3), (0, 0.6, -0.8), curl=1.2)
    up += [bone((0.3, 1.82, -0.42), (0.3, 2.1, -0.2), 0.016, 1.9), robe_shape(skinned([(0.27, 1.42, 0), (0.31, 1.58, -0.08)], [0.075, 0.06], sub=2))]
    made += creature_part('thrower_p2', up, (0.27, 1.42, 0), lambda P, N: np.where((np.linalg.norm(P - np.array([0.29, 1.5, -0.04]), axis=1) < 0.13)[:, None], cloth(P, N), bone_colour(blood=0.15)(P, N)), lite=0.3)
    other = skeleton_arm(-1, (-0.27, 1.42, 0), (-0.3, 1.14, 0.06), (-0.28, 0.96, 0.27), (0, -0.5, 1), curl=0.8)
    other += [robe_shape(skinned([(-0.27, 1.42, 0), (-0.3, 1.24, 0.03)], [0.075, 0.06], sub=2))]
    for i, sd in enumerate((-1, 1)):
        made += creature_part(f'thrower_p{4 + i}', skeleton_leg(sd, (sd * 0.1, 0.9, 0), (sd * 0.1, 0.49, 0.03), (sd * 0.1, 0.075, 0.0)), (sd * 0.1, 0.9, 0), bone_colour(), lite=0.3)
    made += creature_part('thrower_p3', other, (-0.27, 1.42, 0), lambda P, N: np.where((np.linalg.norm(P - np.array([-0.285, 1.33, 0.015]), axis=1) < 0.13)[:, None], cloth(P, N), bone_colour(blood=0.15)(P, N)), lite=0.3)
    return made


def boss2():
    """Rubistus Goyitus: a mountain of skulls, rolling. A great ball of the dead, skull on skull, bound round with gut
    and stuck through with long bones, that rolls over the ground at you (the game turns part 0 as he goes: see the
    `roll` gait in enemies/horde.js); and on top of it, riding it, looking at you, one skull as big as a man.
    Part 0: the mound. Part 1: what burns in it (seen between the skulls as it turns). Part 2: the great skull.
    Parts 3 to 5 are nothing (the built one had four limbs; he has none)."""
    rnd = np.random.default_rng(11)
    gore = bone_colour((0.78, 0.72, 0.58), blood=0.4)
    R, C = 1.02, np.array([0.0, 1.04, 0.0])             # the mound: how big, and where its middle is
    heap = [ball(tuple(C), (R * 0.8, R * 0.8, R * 0.8), 20)]                      # (what is behind the skulls: dark, and wet)
    N = 92
    for i in range(N):
        y = 1 - 2 * (i + 0.5) / N
        r = math.sqrt(1 - y * y)
        th = i * 2.399963
        n = np.array([r * math.cos(th), y, r * math.sin(th)])
        size = 1.25 + 0.75 * rnd.random()
        at = C + n * (R - 0.06 * size + 0.07 * rnd.random())
        yaw, pitch = math.atan2(n[0], n[2]), -math.asin(max(-1, min(1, n[1])))      # each looks out of the heap, more or less
        heap += skull(tuple(at), size, (pitch + rnd.uniform(-0.5, 0.5), yaw + rnd.uniform(-0.6, 0.6), rnd.uniform(-0.8, 0.8)), jaw=rnd.random() * 0.6)
    for i in range(16):                                                           # long bones, stuck out of it like quills
        n = rnd.normal(size=3); n /= np.linalg.norm(n)
        heap.append(bone(tuple(C + n * R * 0.7), tuple(C + n * (R * 1.12 + 0.18 * rnd.random())), 0.028, 1.8))
    strands = []
    for k in range(3):                                                            # gut, wound round and round it, three ways
        tilt = Matrix.Rotation(k * 1.05 + 0.4, 3, 'Z') @ Matrix.Rotation(k * 0.9, 3, 'X')
        pts = []
        for a in np.linspace(0, 12.6, 46):
            v = tilt @ Vector((math.cos(a), 0.55 * math.sin(a * 0.5 + k), math.sin(a)))
            v = np.array(v) / np.linalg.norm(v) * (R * 1.0 + 0.03 * math.sin(a * 5))
            pts.append(tuple(C + v))
        strands.append(skinned(pts, [0.045 + 0.012 * math.sin(i * 1.3) for i in range(len(pts))], sub=1))
    def heap_c(P, N2):
        c = gore(P, N2)
        deep = np.linalg.norm(P - C, axis=1) < R * 0.83
        c[deep] = np.array([0.16, 0.03, 0.03]) * (0.5 + noise(P[deep], 20, 3.0))[:, None]
        return c
    made = creature_part('boss2_p0', heap, (0, 0, 0), heap_c, lite=0, keep=0.2, fine=strands, fine_colour=(0.42, 0.14, 0.14))
    embers = [ball(tuple(C + (lambda n: n / np.linalg.norm(n))(rnd.normal(size=3)) * R * 0.84), (0.09, 0.09, 0.09), 8) for _ in range(26)] + [ball(tuple(C), (0.3, 0.3, 0.3), 12)]
    made += creature_part('boss2_p1', embers, (0, 0, 0), lambda P, N2: np.tile(np.array([1.0, 0.22, 0.06]), (len(P), 1)) * (0.6 + 0.8 * noise(P, 9, 1.0))[:, None], lite=0)
    # The great skull, on top: its jaw hanging, a crown of ribs behind it, its eyes lit.
    top = (0, 2.02, 0.12)
    crown = [bone((0.34 * math.sin(a), 2.0, -0.12 + 0.3 * math.cos(a) * 0.5 - 0.1), (0.5 * math.sin(a), 2.5 + 0.12 * math.cos(a * 2), -0.3), 0.022, 1.5) for a in np.linspace(-1.9, 1.9, 7)]
    eyes = [ball((sd * 0.098, 2.335, 0.4), (0.05, 0.05, 0.05), 10) for sd in (-1, 1)]
    def skull_c(P, N2):
        c = bone_colour((0.84, 0.79, 0.64), blood=0.3)(P, N2)
        for sd in (-1, 1):
            lit = np.linalg.norm(P - np.array([sd * 0.098, 2.335, 0.4]), axis=1) < 0.056
            c[lit] = (1.0, 0.72, 0.12)
        return c
    made += creature_part('boss2_p2', skull((0, 2.34, 0.14), 2.75, (0.22, 0, 0), jaw=0.55) + crown + eyes, top, skull_c, lite=0, keep=0.6)
    for i in (3, 4, 5):
        made += creature_part(f'boss2_p{i}', [ball(tuple(C), (0.02, 0.02, 0.02), 4)], (0, 0, 0), lambda P, N2: np.tile(np.array([0.1, 0.02, 0.02]), (len(P), 1)), lite=0)
    return made


def jewels(neck, crown_at):
    """Babitus's gold, in three lots (he puts more of it on as the fight goes: see realMobs.js): a chain and medallion;
    a heavier chain with a great coin on it, and a brooch; and his crown. neck, crown_at: where his neck and the top
    of his head are (the game's directions). Their shine is baked on: they are drawn unlit, so they glint in the dark."""
    def gold_c(P, N):
        L = np.array([0.35, 0.8, 0.45]); L /= np.linalg.norm(L)
        d = np.clip(N @ L, 0, 1)
        half = L + np.array([0, 0, 1.0]); half /= np.linalg.norm(half)
        spec = np.clip(N @ half, 0, 1) ** 24
        rim = (1 - np.abs(N[:, 2])) ** 3
        c = np.outer(0.32 + 0.7 * d, [1.0, 0.72, 0.16]) + np.outer(spec * 1.3 + rim * 0.25, [1.0, 0.95, 0.7])
        return c * (0.85 + 0.3 * noise(P, 60, 2.0))[:, None]
    def add(op, **kw):
        op(**kw)
        o = bpy.context.view_layer.objects.active
        only(o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        return o
    def chain(drop, r, link, n):
        out, pts = [], []
        lie = lambda y: neck[2] + 0.115 + min(0.075, 0.42 * (neck[1] - y))      # (how far forward his chest is at a height: the chain lies on it, not in it)
        for i in range(n):
            t = (i + 0.5) / n
            y = neck[1] + 0.0 - drop * (1 - abs(2 * t - 1) ** 1.7)
            pts.append(((2 * t - 1) * r * 0.72, y, lie(y)))
        for i, p in enumerate(pts):
            q = pts[min(i + 1, n - 1)] if i + 1 < n else (2 * p[0] - pts[i - 1][0], 2 * p[1] - pts[i - 1][1], 2 * p[2] - pts[i - 1][2])
            along = Vector(B(q)) - Vector(B(p))
            rot = along.to_track_quat('Y', 'Z').to_euler()
            o = add(bpy.ops.mesh.primitive_torus_add, major_radius=link, minor_radius=link * 0.27, major_segments=14, minor_segments=6, location=B(p), rotation=rot)
            o.data.transform(Matrix.Translation(Vector(B(p))) @ rot.to_matrix().to_4x4() @ Matrix.Rotation(math.pi / 2 if i % 2 else 0, 4, 'Y') @ Matrix.Scale(1.5, 4, (0, 1, 0)) @ rot.to_matrix().to_4x4().inverted() @ Matrix.Translation(-Vector(B(p))))
            out.append(o)
        return out, (0, neck[1] - drop, lie(neck[1] - drop))
    def disc(at, radius, deep, gem=None, rays=0):
        out = [add(bpy.ops.mesh.primitive_cylinder_add, radius=radius, depth=deep, vertices=28, location=B(at), rotation=(math.pi / 2, 0, 0)),
               add(bpy.ops.mesh.primitive_torus_add, major_radius=radius, minor_radius=deep * 0.6, major_segments=28, minor_segments=8, location=B(at), rotation=(math.pi / 2, 0, 0)),
               add(bpy.ops.mesh.primitive_torus_add, major_radius=radius * 0.62, minor_radius=deep * 0.3, major_segments=24, minor_segments=6, location=B((at[0], at[1], at[2] + deep * 0.5)), rotation=(math.pi / 2, 0, 0))]
        for k in range(rays):
            a = k * 2 * math.pi / rays
            out.append(add(bpy.ops.mesh.primitive_cone_add, radius1=radius * 0.13, depth=radius * 0.45, vertices=6, location=B((at[0] + math.sin(a) * radius * 1.2, at[1] + math.cos(a) * radius * 1.2, at[2])), rotation=(0, -a, 0)))
        gems = [ball((at[0], at[1], at[2] + deep * 0.6), (radius * gem, radius * gem, radius * gem * 0.6), 12)] if gem else []
        return out, gems
    made = []
    # 1: a chain of fine links, and a medallion with a red stone in it.
    links, low = chain(0.2, 0.105, 0.0135, 40)
    medal, gems = disc((low[0], low[1] - 0.045, low[2] + 0.004), 0.04, 0.012, gem=0.42)
    made += creature_part('boss3_gold1', links + medal, (0, 0, 0), gold_c, lite=0, fine=gems, fine_colour=(1.0, 0.08, 0.1))
    # 2: a rope of a chain down to his belly with a coin the size of a saucer on it, sun-rayed; and a brooch on his lapel.
    links, low = chain(0.36, 0.125, 0.021, 38)
    coin, gems = disc((low[0], low[1] - 0.075, low[2] + 0.006), 0.07, 0.018, gem=0.3, rays=12)
    brooch, g2 = disc((0.1, neck[1] - 0.07, neck[2] + 0.155), 0.024, 0.01, gem=0.6, rays=8)
    made += creature_part('boss3_gold2', links + coin + brooch, (0, 0, 0), gold_c, lite=0, fine=gems + g2, fine_colour=(0.1, 0.9, 0.35))
    # 3: his crown: a band, eight points with a bead on each, an arch over the top, stones all round.
    cy, cz, cr = crown_at[1] - 0.035, crown_at[2] - 0.01, 0.098
    crown = [add(bpy.ops.mesh.primitive_cylinder_add, radius=cr, depth=0.05, vertices=32, end_fill_type='NOTHING', location=B((0, cy, cz))),
             add(bpy.ops.mesh.primitive_torus_add, major_radius=cr, minor_radius=0.009, major_segments=32, minor_segments=8, location=B((0, cy - 0.025, cz))),
             add(bpy.ops.mesh.primitive_torus_add, major_radius=cr, minor_radius=0.007, major_segments=32, minor_segments=8, location=B((0, cy + 0.025, cz)))]
    stones = []
    for k in range(8):
        a = k * math.pi / 4
        x, z = math.sin(a) * cr, cz + math.cos(a) * cr
        tall = 0.085 if k % 2 == 0 else 0.055
        crown.append(add(bpy.ops.mesh.primitive_cone_add, radius1=0.026, depth=tall, vertices=4, location=B((x, cy + 0.025 + tall / 2, z)), rotation=(0, 0, -a + math.pi / 4)))
        crown.append(ball((x, cy + 0.03 + tall, z), (0.011, 0.011, 0.011), 8))
        stones.append(ball((x * 1.04, cy, cz + (z - cz) * 1.04), (0.013, 0.016, 0.013), 8))
    for a in (0, math.pi / 2):                                   # the arches over the top, and the orb where they cross
        pts = [(math.sin(a) * cr * math.cos(t), cy + 0.025 + 0.085 * math.sin(t), cz + math.cos(a) * cr * math.cos(t)) for t in np.linspace(0, math.pi, 9)]
        crown.append(skinned(pts, [0.006] * len(pts), sub=1))
    crown.append(ball((0, cy + 0.125, cz), (0.02, 0.02, 0.02), 10))
    made += creature_part('boss3_gold3', crown, (0, 0, 0), gold_c, lite=0, fine=stones, fine_colour=(0.75, 0.08, 0.95))
    return made


def ultimus():
    """Goyitus Ultimus: what the three brothers have become, dead, on the hill. One ghost, and something of each of
    them in it: Rubistus's great skull for a head, and a cage of ribs and a rabble of skulls about him; Hamzitus's
    bulk, his belly split and burning, his hooks and chains, his cleaver; Babitus's crown, and a hand of cards. Below
    the waist there is nothing of him but a tail of rags. Part 0: his flesh. 1: what burns in him. 2, 3: his arms.
    4: his bones and his crown. 5: his iron."""
    rnd = np.random.default_rng(23)
    made = []
    # ---- his flesh: the bulk of him, and the tail it trails away into ----
    tail = skinned([(0, 1.25, 0), (0, 0.95, -0.02), (0.04, 0.6, -0.1), (0.1, 0.25, -0.26), (0.05, -0.1, -0.5), (-0.08, -0.4, -0.78), (0, -0.62, -1.0)], [0.5, 0.52, 0.42, 0.3, 0.2, 0.11, 0.03], sub=3)
    co = np.empty(len(tail.data.vertices) * 3); tail.data.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    a = np.arctan2(co[:, 1], co[:, 0])
    k = 1 + 0.18 * np.sin(a * 9 + co[:, 2] * 4) * np.clip(1.2 - co[:, 2], 0, 1.4)      # hanging in folds, raggeder the lower it goes
    co[:, 0] *= k; co[:, 1] *= k
    tail.data.vertices.foreach_set('co', co.ravel())
    flesh = [tail, ball((0, 1.5, 0.02), (0.64, 0.56, 0.5), 22), ball((0, 1.22, 0.14), (0.6, 0.42, 0.52), 20)] + [ball((sd * 0.5, 1.9, -0.02), (0.3, 0.26, 0.28), 14) for sd in (-1, 1)] + [ball((0, 2.0, 0.0), (0.26, 0.2, 0.24), 12)]
    def flesh_c(P, N):
        c = np.tile(np.array([0.36, 0.44, 0.3]), (len(P), 1)) * (0.55 + 0.8 * noise(P, 9, 2.0))[:, None]
        c = c * (1 - np.clip((noise(P, 4, 7.0) - 0.6) * 5, 0, 0.7)[:, None]) + np.array([0.25, 0.03, 0.03]) * np.clip((noise(P, 4, 7.0) - 0.6) * 5, 0, 0.7)[:, None]
        wound = np.linalg.norm((P - np.array([0, 1.3, 0.5])) * np.array([1.6, 0.8, 1.0]), axis=1)                    # his belly: split from breast to groin
        c = c * (1 - np.clip((0.34 - wound) / 0.1, 0, 1)[:, None]) + np.array([0.6, 0.05, 0.03]) * np.clip((0.34 - wound) / 0.1, 0, 1)[:, None]
        c = c * (1 - np.clip((0.2 - wound) / 0.08, 0, 1)[:, None]) + np.array([0.06, 0.0, 0.0]) * np.clip((0.2 - wound) / 0.08, 0, 1)[:, None]
        return c * np.clip((P[:, 1] + 0.7) / 1.3, 0.12, 1)[:, None]                                                   # and he thins away to nothing, downward
    made += creature_part('ultimus_p0', flesh, (0, 0, 0), flesh_c, lite=0, keep=0.6)
    # ---- what burns in him ----
    burn = [ball((sd * 0.09, 2.36, 0.44), (0.048, 0.048, 0.048), 10) for sd in (-1, 1)] + [ball((0, 1.36, 0.46), (0.13, 0.2, 0.1), 12)] + [ball((0.0, 1.62, 0.36), (0.1, 0.12, 0.08), 10)]
    made += creature_part('ultimus_p1', burn, (0, 0, 0), lambda P, N: np.where((P[:, 1] > 2.2)[:, None], np.array([1.0, 0.8, 0.25]), np.array([1.0, 0.25, 0.08]) * (0.6 + 0.8 * noise(P, 20, 1.0))[:, None]), lite=0)
    # ---- his arms: bone, long, out to either side. The cards in one hand; the cleaver in the other ----
    for i, sd in enumerate((1, -1)):
        S, E, W = np.array([sd * 0.66, 1.9, 0.0]), np.array([sd * 1.05, 1.45, 0.2]), np.array([sd * 0.98, 1.3, 0.72])
        arm = [bone(tuple(S), tuple(E), 0.05, 1.7), bone(tuple(E + [0.03, 0, 0]), tuple(W + [0.03, 0, 0]), 0.032, 1.6), bone(tuple(E - [0.03, 0, 0]), tuple(W - [0.03, 0, 0]), 0.036, 1.6)]
        arm += hand_bones(tuple(W), (0, 0.5, 0.85), 2.6, 1.1, sd)
        arm += skull(tuple(S + [sd * 0.02, 0.06, 0]), 1.5, (0, sd * 1.3, 0), jaw=0.2)                        # (a skull for a shoulder)
        if sd > 0:
            held = [ball((W[0] + (c - 2) * 0.085, W[1] + 0.3 - abs(c - 2) * 0.035, W[2] + 0.12 + c * 0.004), (0.07, 0.11, 0.006), 10) for c in range(5)]   # five cards, fanned
            def arm_c(P, N, W=W):
                c = bone_colour((0.8, 0.76, 0.62), blood=0.3)(P, N)
                card = (np.abs(P[:, 2] - W[2] - 0.13) < 0.02) & (P[:, 1] > W[1] + 0.12)
                c[card] = (0.96, 0.94, 0.88)
                pip = card & (np.linalg.norm(np.stack([(P[:, 0] - W[0] + 0.0425) % 0.085 - 0.0425, P[:, 1] - W[1] - 0.3], 1), axis=1) < 0.028)
                c[pip] = (0.8, 0.05, 0.08)
                return c
        else:
            held = [bone(tuple(W + [0, -0.12, 0.02]), tuple(W + [0, 0.26, 0.1]), 0.03, 1.2), ball((W[0], W[1] + 0.52, W[2] + 0.3), (0.012, 0.3, 0.2), 14)]                 # his cleaver
            def arm_c(P, N, W=W):
                c = bone_colour((0.8, 0.76, 0.62), blood=0.3)(P, N)
                blade = (P[:, 1] > W[1] + 0.24) & (np.abs(P[:, 0] - W[0]) < 0.02)
                c[blade] = np.array([0.55, 0.57, 0.6]) * (0.7 + 0.5 * noise(P[blade], 30, 1.0))[:, None]
                c[blade & (noise(P, 7, 3.0) > 0.55)] = (0.45, 0.03, 0.03)
                return c
        made += creature_part(f'ultimus_p{2 + i}', arm + held, tuple(S), arm_c, lite=0, keep=0.5)
    # ---- his bones: the great skull, crowned; the cage of his chest; the dead that ride on him ----
    bones = skull((0, 2.38, 0.16), 2.5, (0.2, 0, 0), jaw=0.6) + ribcage(1.98, 1.42, 0.62, 0.5, ribs=6)
    for i in range(14):
        th = i * 2.399
        y = 1.05 + 0.9 * ((i * 0.618) % 1)
        if abs(math.sin(th)) < 0.45 and math.cos(th) > 0:
            continue                                   # (not over his belly: that is open)
        bones += skull((0.66 * math.sin(th), y, 0.02 + 0.52 * math.cos(th)), 1.1 + 0.5 * rnd.random(), (rnd.uniform(-0.4, 0.4), th + rnd.uniform(-0.4, 0.4), rnd.uniform(-0.5, 0.5)), jaw=rnd.random() * 0.5)
    cy, cz, cr = 2.6, 0.13, 0.215
    crown = [skinned([(cr * math.sin(a), cy, cz + cr * math.cos(a)) for a in np.linspace(0, 2 * math.pi, 17)], [0.034] * 17, sub=1)]
    for kk in range(8):
        a = kk * math.pi / 4
        crown.append(skinned([(cr * math.sin(a), cy + 0.02, cz + cr * math.cos(a)), (cr * 1.08 * math.sin(a), cy + (0.26 if kk % 2 == 0 else 0.17), cz + cr * 1.08 * math.cos(a))], [0.04, 0.008], sub=1))
        crown.append(ball((cr * 1.08 * math.sin(a), cy + (0.28 if kk % 2 == 0 else 0.19), cz + cr * 1.08 * math.cos(a)), (0.026, 0.026, 0.026), 8))
    def bones_c(P, N):
        c = bone_colour((0.82, 0.78, 0.64), blood=0.35)(P, N)
        gold = (P[:, 1] > cy - 0.04) & (np.abs(np.hypot(P[:, 0], P[:, 2] - cz) - cr) < 0.09)
        c[gold] = np.array([1.0, 0.72, 0.16]) * (0.6 + 0.7 * np.clip(N[gold] @ np.array([0.3, 0.8, 0.5]), 0, 1))[:, None]
        return c
    made += creature_part('ultimus_p4', bones + crown, (0, 0, 0), bones_c, lite=0, keep=0.3)
    # ---- his iron: a hook through each shoulder, the chains off them swinging down behind him ----
    iron = []
    for sd in (-1, 1):
        iron.append(skinned([(sd * 0.5, 2.1, -0.1), (sd * 0.5, 2.2, 0.06), (sd * 0.5, 2.1, 0.2), (sd * 0.5, 1.95, 0.22), (sd * 0.5, 1.86, 0.14)], [0.034, 0.034, 0.03, 0.022, 0.006], sub=1))
        pts = [(sd * (0.5 + 0.12 * math.sin(t * 3)), 2.1 - t * 1.5, -0.12 - 0.5 * t - 0.2 * math.sin(t * math.pi)) for t in np.linspace(0, 1, 15)]
        for j in range(len(pts) - 1):
            iron.append(skinned([pts[j], pts[j + 1]], [0.03, 0.03] if j % 2 else [(0.012, 0.04), (0.012, 0.04)], sub=0))
    made += creature_part('ultimus_p5', iron, (0, 0, 0), lambda P, N: np.tile(np.array([0.2, 0.19, 0.2]), (len(P), 1)) * (0.5 + 1.0 * noise(P, 30, 2.0))[:, None], lite=0)
    return made


X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
FIGURES = [
    # The zombie: a gaunt man, grey-green, his mouth hanging open, reaching for you; his clothes filthy and torn.
    dict(name='shambler', suit='male_casualsuit02',
         macro={'gender': 1.0, 'age': 0.72, 'muscle': 0.35, 'weight': 0.12, 'height': 0.5, 'proportions': 0.4},
         face={U + 'mouth-open': 0.9, U + 'mouth-depression': 0.6, U + 'eye-left-opened-up': 0.9, U + 'eye-right-opened-up': 0.5, U + 'eyebrows-left-down': 0.8, U + 'eyebrows-right-down': 0.8,
               'cheek/l-cheek-volume-decr': 1.0, 'cheek/r-cheek-volume-decr': 1.0, 'eyes/l-eye-bag-incr': 1.0, 'eyes/r-eye-bag-incr': 1.0, 'head/head-fat-decr': 0.8},
         # hunched, his head forward and to one side, both arms out in front of him (one higher)
         pose=[('spine_01', X, 8), ('spine_02', X, 10), ('spine_03', X, 8), ('neck_01', X, -6), ('head', Y, 14), ('head', X, -16),
               ('upperarm_l', X, -78), ('upperarm_l', Z, -28), ('lowerarm_l', X, -14), ('upperarm_r', X, -56), ('upperarm_r', Z, 24), ('lowerarm_r', X, -22),
               ('thigh_l', X, -6), ('calf_l', X, 10), ('thigh_r', X, 5)],
         # holes in the sleeves, a knee and the belly (not his seat or his flies)
         holes=lambda C: ((noise(C, 9, 3.1) > 0.78) | ((noise(C, 6, 7.7) > 0.8) & (C[:, 2] < 0.6))) & ((C[:, 2] < 0.74) | (C[:, 2] > 1.08))),
    # Hamzitus Goyitus: a giant of a dead man, enormously fat, stripped to the waist, his belly split open; what is
    # left of a shirt hangs off his shoulders in rags. Head down, arms out wide: he is coming to crush you.
    dict(name='boss', suit='male_casualsuit02', head=False, lite=False, keep=0.8, gore=True, skin=[0.74, 0.86, 0.62],
         macro={'gender': 1.0, 'age': 0.62, 'muscle': 0.4, 'weight': 1.0, 'height': 0.85, 'proportions': 0.25},
         face={U + 'mouth-open': 1.0, U + 'mouth-retraction': 0.8, U + 'eyebrows-left-down': 1.0, U + 'eyebrows-right-down': 1.0, U + 'nose-left-elevation': 0.8, U + 'nose-right-elevation': 0.8,
               'head/head-fat-incr': 1.0, 'eyes/l-eye-bag-incr': 1.0, 'eyes/r-eye-bag-incr': 1.0, 'cheek/l-cheek-volume-incr': 0.8, 'cheek/r-cheek-volume-incr': 0.8,
               'stomach/stomach-pregnant-incr': 1.0, 'stomach/stomach-tone-decr': 1.0, 'torso/measure-waist-circ-incr': 1.0, 'torso/measure-bust-circ-incr': 0.8, 'torso/measure-hips-circ-incr': 0.8,
               'torso/torso-scale-depth-incr': 0.8, 'torso/torso-scale-horiz-incr': 0.6, 'neck/neck-double-incr': 1.0, 'torso/torso-muscle-pectoral-decr': 0.6},
         pose=[('spine_02', X, 8), ('spine_03', X, 10), ('neck_01', X, 6), ('head', X, -4),
               ('upperarm_l', X, -34), ('upperarm_l', Y, -18), ('lowerarm_l', X, -40), ('upperarm_r', X, -26), ('upperarm_r', Y, 22), ('lowerarm_r', X, -52),
               ('thigh_l', Y, -5), ('thigh_r', Y, 5)],
         holes=lambda C: ((C[:, 2] > 1.0) & ~((noise(C, 7, 5.5) > 0.6) & (C[:, 2] > 1.32) & (np.abs(C[:, 0]) > 0.1))) | ((noise(C, 8, 2.2) > 0.78) & (C[:, 2] < 0.7))),
    # Babitus Goyitus, who owns the House: tall, thin, long dead and immaculately dressed. A dark suit and a tie,
    # his skin the grey of old paper. He stands very straight, his hands a little out from his sides.
    dict(name='boss3', suit='male_elegantsuit01', head=False, lite=False, gold=True, dealer=True, grip={'l': ((62, 70, 45), 0), 'r': ((28, 30, 20), 150)}, keep=0.4, skin=[0.86, 0.84, 0.8],
         macro={'gender': 1.0, 'age': 0.8, 'muscle': 0.4, 'weight': 0.2, 'height': 0.9, 'proportions': 0.8},
         face={U + 'mouth-corner-puller': 0.9, U + 'eyebrows-left-down': 0.6, U + 'eyebrows-right-down': 0.6, U + 'eye-left-slit': 0.5, U + 'eye-right-slit': 0.5,
               'cheek/l-cheek-volume-decr': 1.0, 'cheek/r-cheek-volume-decr': 1.0, 'head/head-fat-decr': 1.0, 'eyes/l-eye-bag-incr': 0.7, 'eyes/r-eye-bag-incr': 0.7},
         pose=[('spine_03', X, -3), ('head', X, 4), ('upperarm_l', Y, 34), ('upperarm_r', Y, -22), ('upperarm_l', X, -8), ('lowerarm_l', X, -62), ('lowerarm_r', X, -58)],
         holes=lambda C: np.zeros(len(C), dtype=bool),
         # his suit: as it comes (charcoal, a striped tie), a little dusty, with a dark stain here and there
         cloth=lambda c, P, lum, mix, noise, blood, old_blood, mud: mix(c * (0.8 + 0.3 * noise(P, 20, 4.0))[:, None], old_blood, np.clip((noise(P, 5, 6.0) - 0.72) * 8, 0, 0.7))),
    # The ghost: what is left of a starved man, from the hips up, screaming, his arms out for you. Pale as ice.
    dict(name='wraith', suit=None, shoes=False, head=False, legless=True, spectral=[0.72, 0.92, 1.0], drop=0.6, keep=0.6, index={'body': 0, 'eyes': 1, 'arm_r': 2, 'arm_l': 3},
         macro={'gender': 1.0, 'age': 0.85, 'muscle': 0.2, 'weight': 0.0, 'height': 0.5, 'proportions': 0.4},
         face={U + 'mouth-open': 1.0, U + 'mouth-depression': 0.8, U + 'eye-left-opened-up': 1.0, U + 'eye-right-opened-up': 1.0, U + 'eyebrows-left-inner-up': 1.0, U + 'eyebrows-right-inner-up': 1.0,
               'cheek/l-cheek-volume-decr': 1.0, 'cheek/r-cheek-volume-decr': 1.0, 'head/head-fat-decr': 1.0, 'eyes/l-eye-bag-incr': 1.0, 'eyes/r-eye-bag-incr': 1.0},
         pose=[('spine_02', X, 12), ('spine_03', X, 10), ('neck_01', X, -10), ('head', X, -14),
               ('upperarm_l', X, -84), ('upperarm_l', Z, -22), ('lowerarm_l', X, -10), ('upperarm_r', X, -84), ('upperarm_r', Z, 22), ('lowerarm_r', X, -10)],
         holes=lambda C: np.zeros(len(C), dtype=bool)),
]


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    made = []
    for spec in FIGURES:
        these = figure(spec)
        for o in these:
            print('MESH', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), 'tris', [round(v, 3) for v in o.location])
        print('TOTAL', spec['name'], sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in these if '_lite_' not in o.name))
        if PREVIEW:
            for o in made:
                o.hide_render = True
            for o in these:
                o.hide_render = '_lite_' in o.name
            for i, (eye, look) in enumerate([((1.8, -4.4, 1.3), (0, 0, 0.95)), ((0.5, -1.5, 1.7), (0, -0.1, 1.6))]):
                cam.location = eye
                cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
                scene.render.resolution_x, scene.render.resolution_y = 700, 900
                scene.render.filepath = PREVIEW.replace('.png', '_' + spec['name'] + '_' + str(i) + '.png')
                scene.render.engine = 'BLENDER_WORKBENCH'
                scene.display.shading.light = 'STUDIO'
                scene.display.shading.color_type = 'VERTEX'
                bpy.ops.render.render(write_still=True)
        made += these
    for build in (rat, crawler, rattler, thrower, boss2, ultimus):
        these = build()
        print('TOTAL', build.__name__, sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in these if '_lite_' not in o.name), 'lite', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in these if '_lite_' in o.name))
        if PREVIEW:
            for o in made:
                o.hide_render = True
            for o in these:
                o.hide_render = '_lite_' in o.name
            tall = build.__name__ in ('rattler', 'thrower', 'boss2', 'ultimus')
            for i, (eye, look) in enumerate([((2.2, -5.2, 1.6), (0, 0, 1.1)), ((0.4, -1.6, 1.75), (0, 0, 1.6))] if tall else [((1.6, -2.2, 1.1), (0, 0, 0.3)), ((-0.4, -2.4, 0.5), (0, 0, 0.35))]):
                cam.location = eye
                cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
                scene.render.resolution_x, scene.render.resolution_y = 800, 600
                scene.render.filepath = PREVIEW.replace('.png', '_' + build.__name__ + '_' + str(i) + '.png')
                scene.render.engine = 'BLENDER_WORKBENCH'
                scene.display.shading.light = 'STUDIO'
                scene.display.shading.color_type = 'VERTEX'
                bpy.ops.render.render(write_still=True)
        made += these
    for o in bpy.data.objects:
        o.select_set(o in made)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_skins=False, export_yup=True,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_materials='PLACEHOLDER', export_texcoords=False)
    print('EXPORTED', OUT, os.path.getsize(OUT))


try:
    main()
except Exception:
    traceback.print_exc()
