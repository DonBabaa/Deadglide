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
import bpy, sys, os

a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = os.path.abspath(a[0]), os.path.abspath(a[1])
COLOUR, BUMPS, HAIR = 2048, 1024, 512


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
    act = bpy.data.actions[0]
    act.name = 'bartend'
    print('CLIP', act.name, [round(x) for x in act.frame_range], 'meshes', [(o.name, len(o.data.vertices)) for o in meshes])
    for o in bpy.data.objects:
        o.select_set(o is arm or o in meshes)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS', export_yup=True, export_skins=True,
                              export_force_sampling=True, export_optimize_animation_size=True, export_image_format='JPEG', export_jpeg_quality=80, export_frame_step=2, export_materials='EXPORT')
    print('WROTE', OUT, os.path.getsize(OUT))


main()
