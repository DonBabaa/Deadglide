# DEAD AIR's station kit: the pieces of Quaternius's Modular Sci-Fi MegaKit (CC0) that the station is built from,
# merged into one file, public/models/deadair_kit.glb. Each piece is a node named as the kit names it; the game lays
# them out on its 4 m grid (src/deadair/station.js).
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --python tools/build_deadair_kit.py -- dl/deadair/kit public/models/deadair_kit.glb
#
# The kit itself (dl/deadair/kit: its glTF folder and its Textures) is not in the repository; what is made from it is.
# Blender is only used to shrink the textures (the kit's are 2048 PNGs, 25 MB of them): the merging is done here, on
# the files as they are, so every vertex is the kit's own.
#   - the red and blue trim colours are swapped for the kit's own plain ones: the station is grey and grimy, and it is
#     the lights that give it its colour
#   - colour maps are kept at 2048 as JPEG; normal and ORM maps at 1024 as JPEG (they are not seen as colour, and a
#     little softness in them is not seen at all); the decals keep their transparency (PNG)
import json, os, struct, sys, tempfile

import bpy

args = sys.argv[sys.argv.index('--') + 1:]
KIT, OUT = os.path.abspath(args[0]), os.path.abspath(args[1])
GLTF, TEXTURES = os.path.join(KIT, 'glTF'), os.path.join(KIT, 'Textures')

PIECES = {
    'Platforms': ['Platform_Metal', 'Platform_DarkPlates', 'Platform_Squares', 'Platform_3Plates', 'Platform_CenterPlate', 'Platform_Simple', 'Platform_X',
                  'Door_Frame_Square', 'Door_Frame_Square_Blocked', 'Door_Metal', 'Door_DarkMetal', 'Platform_Stairs_4', 'Platform_Rails_4', 'Platform_Window_Wide'],
    'Walls': ['WallAstra_Straight', 'WallAstra_Straight_Window', 'WallAstra_Straight_Broken', 'WallAstra_Straight_Divided', 'WallAstra_Straight_Flat',
              'WallAstra_Corner_Square_Inner', 'WallAstra_Corner_Square_Outer', 'WallBand_Straight', 'WallBand_Straight_Broken', 'WallBand_Corner_Square_Inner',
              'WallBand_Corner_Square_Outer', 'WallWindow_Straight', 'TopCables_Straight', 'TopCables_Straight_Hanging', 'TopCables_Corner_Square_Inner',
              'TopCables_Corner_Square_Outer', 'TopSimple_Straight', 'TopPlastic_Straight', 'BottomMetal_Straight', 'BottomMetal_Corner_Square_Inner',
              'BottomMetal_Corner_Square_Outer_1'],
    'Columns': ['Column_Pipes', 'Column_MetalSupport', 'Column_Simple'],
    'Props': ['Prop_Light_Wide', 'Prop_Light_Small', 'Prop_Light_Corner', 'Prop_Light_Floor', 'Prop_Crate4', 'Prop_Crate3', 'Prop_Barrel_Large', 'Prop_Computer',
              'Prop_Vent_Big', 'Prop_Vent_Small', 'Prop_Vent_Wide', 'Prop_Chest', 'Prop_AccessPoint', 'Prop_Cable_1', 'Prop_Cable_3', 'Prop_Fan_Small',
              'Prop_PipeHolder', 'Prop_ItemHolder'],
    'Decals': ['Decal_Sign', 'Decal_XSign', 'Decal_Line_Straight', 'Decal_Logo', 'Decal_A', 'Decal_K', 'Decal_X', 'Decal_Dashes'] + [f'Decal_{n}' for n in range(10)],
    'Aliens': ['Alien_Cyclop', 'Alien_Oculichrysalis', 'Alien_Scolitex'],
}
PLAIN = {'T_Trim_01_BaseColor_Red.png': 'T_Trim_01_BaseColor.png', 'T_Trim_02_BaseColor_Red.png': 'T_Trim_02_BaseColor.png', 'T_Trim_02_BaseColor_Blue.png': 'T_Trim_02_BaseColor.png'}


def shrink(name):
    """The texture as JPEG (or PNG, if it has transparency that matters), at the size it needs: (bytes, mimeType)."""
    path = os.path.join(TEXTURES, name)
    keep_alpha = 'Decal' in name
    colour = 'BaseColor' in name or 'Cables' in name or 'Decal' in name or 'Emissive' in name
    size = 2048 if colour else 1024
    img = bpy.data.images.load(path)
    if not colour: img.colorspace_settings.name = 'Non-Color'
    if img.size[0] > size: img.scale(size, size)
    ext = 'png' if keep_alpha else 'jpg'
    out = os.path.join(tempfile.gettempdir(), f'deadair_{name[:-4]}.{ext}')
    img.file_format = 'PNG' if keep_alpha else 'JPEG'
    img.save(filepath=out, quality=88)
    data = open(out, 'rb').read()
    bpy.data.images.remove(img)
    return data, 'image/png' if keep_alpha else 'image/jpeg'


merged = {'asset': {'version': '2.0', 'generator': 'DeadSlide build_deadair_kit.py (Quaternius Modular Sci-Fi MegaKit, CC0)'},
          'scene': 0, 'scenes': [{'name': 'kit', 'nodes': []}], 'nodes': [], 'meshes': [], 'accessors': [], 'bufferViews': [],
          'buffers': [{'byteLength': 0}], 'materials': [], 'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
          'extensionsUsed': []}
blob = bytearray()
materials, images, textures = {}, {}, {}


def add_bytes(data, target=None):
    while len(blob) % 4: blob.append(0)
    view = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
    if target: view['target'] = target
    blob.extend(data)
    merged['bufferViews'].append(view)
    return len(merged['bufferViews']) - 1


def image_index(uri):
    uri = PLAIN.get(uri, uri)
    if uri not in images:
        data, mime = shrink(uri)
        merged['images'].append({'name': uri[:-4], 'bufferView': add_bytes(data), 'mimeType': mime})
        images[uri] = len(merged['images']) - 1
    return images[uri]


def texture_index(doc, index):
    src = doc['images'][doc['textures'][index]['source']]['uri']
    i = image_index(src)
    if i not in textures:
        merged['textures'].append({'sampler': 0, 'source': i})
        textures[i] = len(merged['textures']) - 1
    return textures[i]


def material_index(doc, index):
    m = doc['materials'][index]
    if m['name'] in materials: return materials[m['name']]
    m = json.loads(json.dumps(m))
    for slot in ('normalTexture', 'emissiveTexture', 'occlusionTexture'):
        if slot in m: m[slot]['index'] = texture_index(doc, m[slot]['index'])
    pbr = m.get('pbrMetallicRoughness', {})
    for slot in ('baseColorTexture', 'metallicRoughnessTexture'):
        if slot in pbr: pbr[slot]['index'] = texture_index(doc, pbr[slot]['index'])
    for ext in m.get('extensions', {}):
        if ext not in merged['extensionsUsed']: merged['extensionsUsed'].append(ext)
    merged['materials'].append(m)
    materials[m['name']] = len(merged['materials']) - 1
    return materials[m['name']]


count = 0
for folder, names in PIECES.items():
    for name in names:
        path = os.path.join(GLTF, folder, f'{name}.gltf')
        doc = json.load(open(path))
        data = open(os.path.join(GLTF, folder, doc['buffers'][0]['uri']), 'rb').read()
        views = {}
        for i, v in enumerate(doc['bufferViews']):
            start = v.get('byteOffset', 0)
            views[i] = add_bytes(data[start:start + v['byteLength']], v.get('target'))
            if 'byteStride' in v: merged['bufferViews'][views[i]]['byteStride'] = v['byteStride']
        accessors = {}
        for i, a in enumerate(doc['accessors']):
            a = dict(a)
            if 'bufferView' in a: a['bufferView'] = views[a['bufferView']]
            merged['accessors'].append(a)
            accessors[i] = len(merged['accessors']) - 1
        meshes = {}
        for i, m in enumerate(doc['meshes']):
            prims = []
            for p in m['primitives']:
                q = {'attributes': {k: accessors[v] for k, v in p['attributes'].items()}, 'mode': p.get('mode', 4)}
                if 'indices' in p: q['indices'] = accessors[p['indices']]
                if 'material' in p: q['material'] = material_index(doc, p['material'])
                prims.append(q)
            merged['meshes'].append({'name': m.get('name', name), 'primitives': prims})
            meshes[i] = len(merged['meshes']) - 1
        # The piece: one node named for it, holding whatever nodes the piece is made of.
        children = []
        for n in doc['nodes']:
            node = {k: v for k, v in n.items() if k in ('translation', 'rotation', 'scale', 'matrix')}
            if 'mesh' in n: node['mesh'] = meshes[n['mesh']]
            node['name'] = n.get('name', name)
            merged['nodes'].append(node)
            children.append(len(merged['nodes']) - 1)
        merged['nodes'].append({'name': name, 'children': children})
        merged['scenes'][0]['nodes'].append(len(merged['nodes']) - 1)
        count += 1

merged['buffers'][0]['byteLength'] = len(blob)
if not merged['extensionsUsed']: del merged['extensionsUsed']
js = json.dumps(merged, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
while len(blob) % 4: blob.append(0)
total = 12 + 8 + len(js) + 8 + len(blob)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, total))
    f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
    f.write(struct.pack('<I4s', len(blob), b'BIN\x00')); f.write(blob)
print(f'deadair_kit.glb: {count} pieces, {len(merged["materials"])} materials, {len(merged["images"])} textures, {total / 1e6:.2f} MB')
