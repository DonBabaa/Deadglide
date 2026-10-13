# Kirky's lighter: public/models/lighter.glb, from the lighter in dl/ (not in the repository: "Lighter" by Johnathon
# Goswick, CC-BY-4.0: see public/models/CREDITS.txt).
#
#   blender --background --python tools/build_lighter.py -- dl/lighter.glb public/models/lighter.glb [preview.png]
#
# The game draws it by the colours of its points, as it does everything he carries: so its picture is put on its
# points (after its faces have been cut finer, to have enough of them to carry it), and it is made the size of a
# lighter (TALL), stood upright with the middle of its foot at the origin: the game holds it there.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

a = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = os.path.abspath(a[0]), os.path.abspath(a[1])
TALL = 0.075          # from its foot to the top of its open lid (m)
GAIN = 1.25


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=SRC)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in bpy.data.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    it = meshes[0]
    world = it.matrix_world.copy()
    it.parent = None
    it.matrix_world = world
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.data.objects):
        if o is not it:
            bpy.data.objects.remove(o, do_unlink=True)
    mod = it.modifiers.new('fine', 'SUBSURF')
    mod.subdivision_type = 'SIMPLE'
    mod.levels = 1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    mesh = it.data
    image = None
    for mat in mesh.materials:
        if mat and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and any(l.to_socket.name == 'Base Color' for l in n.outputs['Color'].links):
                    image = n.image
    W, H = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(H, W, 4)[:, :, :3]
    uv = np.empty(len(mesh.loops) * 2, dtype=np.float32); mesh.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    at = np.empty(len(mesh.loops), dtype=np.int64); mesh.loops.foreach_get('vertex_index', at)
    seen = px[np.clip((uv[:, 1] % 1.0 * H).astype(int), 0, H - 1), np.clip((uv[:, 0] % 1.0 * W).astype(int), 0, W - 1)]
    total = np.zeros((len(mesh.vertices), 3)); count = np.zeros(len(mesh.vertices))
    np.add.at(total, at, seen); np.add.at(count, at, 1)
    colour = np.clip((total / np.maximum(count, 1)[:, None]) ** 2.2 * GAIN + 0.004, 0, 1)
    layer = mesh.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    layer.data.foreach_set('color', np.hstack([colour, np.ones((len(colour), 1))]).ravel())
    shared = bpy.data.materials.new('Lighter')
    shared.use_nodes = True
    col = shared.node_tree.nodes.new('ShaderNodeVertexColor')
    col.layer_name = 'Color'
    shader = next(n for n in shared.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shared.node_tree.links.new(col.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Metallic'].default_value = 0.85
    shader.inputs['Roughness'].default_value = 0.32
    mesh.materials.clear(); mesh.materials.append(shared)
    P = [v.co.copy() for v in mesh.vertices]
    lo = Vector([min(p[i] for p in P) for i in range(3)]); hi = Vector([max(p[i] for p in P) for i in range(3)])
    k = TALL / (hi.z - lo.z)
    # (the middle of its foot: of what is in the lowest tenth of it)
    foot = [p for p in P if p.z < lo.z + 0.1 * (hi.z - lo.z)]
    mid = Vector((sum(p.x for p in foot) / len(foot), sum(p.y for p in foot) / len(foot), lo.z))
    mesh.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-mid))
    it.name = mesh.name = 'lighter'
    P = [v.co for v in mesh.vertices]
    print('LIGHTER', len(mesh.vertices), 'points,', sum(len(p.vertices) - 2 for p in mesh.polygons), 'triangles; box', [round(min(p[i] for p in P), 4) for i in range(3)], [round(max(p[i] for p in P), 4) for i in range(3)])
    # where the flame comes out: the top of what is over its foot (its chimney), not its lid, which is thrown back
    over = [p for p in P if (p.x ** 2 + p.y ** 2) ** 0.5 < 0.012]
    print('CHIMNEY top', round(max(p.z for p in over), 4), 'of', len(over), 'points over its foot')
    only = lambda o: [ob.select_set(ob is o) for ob in bpy.data.objects]
    only(it)
    bpy.context.view_layer.objects.active = it
    bpy.ops.object.shade_smooth()
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_yup=True, export_materials='EXPORT')
    print('WROTE', OUT, os.path.getsize(OUT))
    if len(a) > 2:
        scene = bpy.context.scene
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); scene.collection.objects.link(sun); sun.data.energy = 3; sun.rotation_euler = (0.9, 0.2, 0.6)
        scene.render.resolution_x, scene.render.resolution_y = 700, 700
        scene.world = bpy.data.worlds.new('w'); scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.3, 0.3, 0.33, 1)
        for i, d in enumerate((Vector((0.3, -1, 0.25)), Vector((1, 0.1, 0.2)))):
            cam.location = Vector((0, 0, TALL / 2)) + d.normalized() * 0.22
            cam.rotation_euler = (Vector((0, 0, TALL / 2)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
            cam.data.clip_start = 0.01
            scene.render.filepath = a[2].replace('.png', f'_{i}.png')
            bpy.ops.render.render(write_still=True)
            print('RENDERED', scene.render.filepath)


main()
