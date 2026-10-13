# Who tends the casino's bar: public/models/barman.glb, from dl/Bartending.fbx (not in the repository: a Mixamo
# character, a woman in a dark suit, and Mixamo's "Bartending" on her own skeleton: see public/models/CREDITS.txt).
#
#   blender --background --python tools/build_staff.py -- dl/Bartending.fbx public/models/barman.glb
#
# She is the one thing in the casino that is drawn skinned, with her own pictures on her (there is one of her, and the
# camera goes right up to her face): so all that is done here is to make the file small enough to ship. Her pictures
# are cut down (COLOUR, BUMPS, HAIR: how big each is kept) and only her colours and the bumps in her are kept, with what is
# see-through in her hair and lashes; and her clip is the one that came with her, named `bartend`. She stands as the
# clip has her (its middle is where her glass goes: she is half a metre behind that), facing +z in the game.
#
# She is given two more clips for when there is nothing to make (IDLES: Mixamo's too, from the library in dl/: stood
# breathing, and stood, her weight on one leg and then the other). They were made on other characters, with the same bones as hers: so however
# far each of theirs has turned from how it stood, frame by frame, hers is turned as far from how she stood; and her
# hips are kept where the first frame of `bartend` has them (behind the bar), moving only as much as theirs move.
import bpy, sys, os

a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = os.path.abspath(a[0]), os.path.abspath(a[1])
COLOUR, BUMPS, HAIR = 2048, 1024, 512
IDLES = {'idle': 'Breathing Idle.fbx', 'shift': 'Action Adventure Pack/idle.fbx'}


def borrow(arm, name, path, stood):
    """A clip of somebody else's (the FBX at `path`), put onto her (`arm`) as a new action called `name`."""
    scene = bpy.context.scene
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == 'ARMATURE')
    first, last = (int(x) for x in src.animation_data.action.frame_range)
    theirs = {b.name.split(':')[-1]: b.name for b in src.data.bones}
    armW, srcW = arm.matrix_world.to_quaternion(), src.matrix_world.to_quaternion()
    restA = {b.name: b.matrix_local.to_quaternion() for b in arm.data.bones}                      # how each of her bones lies, stood as she was made
    restW = {n: armW @ q for n, q in restA.items()}
    their_rest = {k: (srcW @ src.data.bones[n].matrix_local.to_quaternion()).inverted() for k, n in theirs.items()}
    hips = next(b for b in arm.data.bones if b.name.endswith('Hips'))
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    began = None
    for f in range(first, last + 1):
        scene.frame_set(f)
        got = {}
        for b in arm.data.bones:                                                                   # (parents before children)
            key = b.name.split(':')[-1]
            if key not in theirs:
                continue
            now = srcW @ src.pose.bones[theirs[key]].matrix.to_quaternion()
            want = armW.inverted() @ (now @ their_rest[key] @ restW[b.name])                      # theirs has turned this far from how it stood: so has hers
            parent = b.parent
            while parent and parent.name not in got:
                parent = parent.parent
            base = got[parent.name] @ (restA[parent.name].inverted() @ restA[b.name]) if parent else restA[b.name]
            got[b.name] = want
            q = base.inverted() @ want
            pb = arm.pose.bones[b.name]
            pb.rotation_mode = 'QUATERNION'
            if pb.rotation_quaternion.dot(q) < 0:
                q.negate()                                                                         # (the short way round from the last frame)
            pb.rotation_quaternion = q
            pb.keyframe_insert('rotation_quaternion', frame=f - first + 1)
        # (her hips: where `bartend` has her stand, moved as far as theirs have moved from where they began)
        at = src.matrix_world @ src.pose.bones[theirs['Hips']].head
        if began is None:
            began = at.copy()
        pb = arm.pose.bones[hips.name]
        pb.location = stood + restA[hips.name].inverted() @ (arm.matrix_world.inverted().to_3x3() @ (at - began))
        pb.keyframe_insert('location', frame=f - first + 1)
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, act)
    arm.animation_data.action = None
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    print('BORROWED', name, last - first + 1, 'frames, from', os.path.basename(path))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=SRC)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        tree = mat.node_tree
        shader = next((n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not shader:
            continue
        colour = bumps = None
        clear = False
        for link in tree.links:
            if link.to_node == shader and link.to_socket.name == 'Base Color' and link.from_node.type == 'TEX_IMAGE':
                colour = link.from_node.image
            if link.to_node == shader and link.to_socket.name == 'Alpha' and link.from_node.type == 'TEX_IMAGE':
                clear = True
            if link.to_node.type == 'NORMAL_MAP' and link.from_node.type == 'TEX_IMAGE':
                bumps = link.from_node.image
        print('MATERIAL', mat.name, 'colour', colour and colour.name, 'bumps', bumps and bumps.name, 'see-through', clear)
        tree.nodes.clear()
        out = tree.nodes.new('ShaderNodeOutputMaterial')
        shader = tree.nodes.new('ShaderNodeBsdfPrincipled')
        tree.links.new(shader.outputs['BSDF'], out.inputs['Surface'])
        shader.inputs['Roughness'].default_value = 0.62
        shader.inputs['Metallic'].default_value = 0.0
        if colour:
            size = COLOUR if not clear else HAIR
            if colour.size[0] > size:
                colour.scale(size, size)
            tex = tree.nodes.new('ShaderNodeTexImage'); tex.image = colour
            tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
            if clear:
                tree.links.new(tex.outputs['Alpha'], shader.inputs['Alpha'])
        if bumps and not clear:
            if bumps.size[0] > BUMPS:
                bumps.scale(BUMPS, BUMPS)
            bumps.colorspace_settings.name = 'Non-Color'
            tex = tree.nodes.new('ShaderNodeTexImage'); tex.image = bumps
            nm = tree.nodes.new('ShaderNodeNormalMap')
            tree.links.new(tex.outputs['Color'], nm.inputs['Color'])
            tree.links.new(nm.outputs['Normal'], shader.inputs['Normal'])
        mat.blend_method = 'HASHED' if clear else 'OPAQUE'
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)
    act = arm.animation_data.action
    act.name = 'bartend'
    print('CLIP', act.name, [round(x) for x in act.frame_range], 'meshes', [(o.name, len(o.data.vertices)) for o in meshes])
    bpy.context.scene.frame_set(1)
    stood = next(pb for pb in arm.pose.bones if pb.name.endswith('Hips')).location.copy()   # (where `bartend` has her stand)
    track = arm.animation_data.nla_tracks.new()
    track.name = 'bartend'
    track.strips.new('bartend', int(act.frame_range[0]), act)
    arm.animation_data.action = None
    for name, file in IDLES.items():
        borrow(arm, name, os.path.join(os.path.dirname(SRC), file), stood)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for d in list(block):
            if d.users == 0:
                block.remove(d)
    for o in bpy.data.objects:
        o.select_set(o is arm or o in meshes)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_yup=True, export_skins=True,
                              export_force_sampling=True, export_optimize_animation_size=True, export_image_format='JPEG', export_jpeg_quality=80, export_frame_step=2, export_materials='EXPORT')
    print('WROTE', OUT, os.path.getsize(OUT))


main()
