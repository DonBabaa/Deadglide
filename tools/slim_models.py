# Takes out of the game's model files what the game never reads, and packs what is left: nothing that is drawn, or
# played, is changed by it. Run it after any of the build_*.py scripts has written a model, on the files it wrote:
#
#   python tools/slim_models.py [--check] [name.glb ...]      (no names: every .glb in public/models)
#
# What it does to a file (see RULES for which of these each file gets):
#   - (the monsters' files: mobs.glb, zombies.glb, rat.glb) drops the monsters in it that are never drawn: the ones
#     a later file has taken the place of (the first Hamzitus, Rubistus and rat), the plain far-off versions of
#     monsters that are never drawn plain (the bosses), and anything the game does not look for by name. The rule for
#     what is looked for is src/enemies/realMobs.js's own, copied here: change one, change the other.
#   - drops a kind of data the game does not use from that file (TEXCOORD_0: the monsters and the lighter are drawn by
#     the colours of their points, and the game throws their texture coordinates away as it loads them).
#   - drops every accessor, buffer view and byte that nothing points at any more, and stores once any run of bytes
#     that is in the file twice.
# Every number that is kept is kept as it was, bit for bit. --check: say what would go, and write nothing.
#
# A build does not ship these files as they are either: tools/pack_models.mjs squeezes each one, losing nothing (see there).
import json, struct, sys, os, re, hashlib

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'models')
MONSTERS = ('mobs.glb', 'zombies.glb', 'rat.glb')   # (in the order the game reads them: a later one's monster replaces an earlier one's)
RULES = {
    'mobs.glb': {'monsters': True},
    'zombies.glb': {'monsters': True},   # (its texture coordinates are kept: the zombies are drawn by their own pictures)
    'rat.glb': {'monsters': True, 'drop': ['TEXCOORD_0']},
    'lighter.glb': {'drop': ['TEXCOORD_0']},
}
# (as SWINGS, ENEMY_PARTS and ENEMY_LITE are in src/enemies/realMobs.js and enemyModels.js)
PARTS = {'shambler': 'body head eyes arm_l arm_r leg_l leg_r', 'boss': 'body head arm_l arm_r leg_l leg_r', 'boss2': 'body head arm_l arm_r leg_l leg_r', 'boss3': 'body eyes arm_l arm_r leg_l leg_r'}
PARTS['zombieb'] = PARTS['zombiec'] = PARTS['shambler']
DRAWN = set('shambler rattler wraith rat crawler thrower queen boss boss2 boss3 zombieb zombiec'.split())
PLAIN = set('shambler rattler wraith rat crawler thrower zombieb zombiec'.split())


def read(path):
    with open(path, 'rb') as f:
        magic, version, total = struct.unpack('<4sII', f.read(12))
        assert magic == b'glTF', path
        n, kind = struct.unpack('<I4s', f.read(8)); doc = json.loads(f.read(n))
        rest = f.read(8)
        blob = f.read(struct.unpack('<I4s', rest)[0]) if len(rest) == 8 else b''
    return doc, blob


def write(path, doc, blob):
    text = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    text += b' ' * (-len(text) % 4)
    blob += b'\0' * (-len(blob) % 4)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + (8 + len(blob) if blob else 0)))
        f.write(struct.pack('<I4s', len(text), b'JSON')); f.write(text)
        if blob:
            f.write(struct.pack('<I4s', len(blob), b'BIN\0')); f.write(blob)


def named(doc):
    """The mesh nodes of a file, in the order the game comes to them: [(node index, name as the loader has it)]."""
    out, seen = [], {}
    def walk(i):
        node = doc['nodes'][i]
        if 'mesh' in node:
            name = re.sub(r'[\[\]\.:\/]', '', node.get('name', '').replace(' ', '_'))   # (three's own tidying of a name)
            seen[name] = seen.get(name, 0) + 1
            out.append((i, name if seen[name] == 1 else f'{name}_{seen[name] - 1}'))
        for c in node.get('children', []):
            walk(c)
    for root in doc['scenes'][doc.get('scene', 0)]['nodes']:
        walk(root)
    return out


def looked_for(files):
    """Which mesh nodes of which file the game ends up drawing: {file: set(node index)}. files: in the order it reads them."""
    found, numbered, gold = {}, {}, {}
    for file, doc in files:
        for i, name in named(doc):
            is_ = re.match(r'^([a-z0-9]+)_(lite_)?([a-z_]+?)(?:\d*)$', name, re.I)
            if is_ and is_.group(1) in PARTS and is_.group(3) in PARTS[is_.group(1)].split():
                key = (is_.group(1), bool(is_.group(2)), is_.group(3))   # (a part painted on two pictures is two meshes, head and head2: both kept)
                if key in found and found[key][0] == file: found[key][1].append(i)
                else: found[key] = (file, [i])                           # (a later file's replaces an earlier one's)
            is_ = re.match(r'^([a-z0-9]+?)_(lite_)?p(\d+)$', name, re.I)
            if is_:
                numbered[(is_.group(1), bool(is_.group(2)), int(is_.group(3)))] = (file, i)
            is_ = re.match(r'^boss3_gold(\d)$', name)
            if is_:
                gold[name] = (file, i)
    kept = {file: set() for file, _ in files}
    whole = {name for (name, lite, part) in found if not lite}   # (monsters that come as named parts: those are what is drawn of them...)
    for (name, lite, part), (file, idxs) in found.items():
        if not lite or name in PLAIN:
            kept[file].update(idxs)
    for (name, lite, n), (file, i) in numbered.items():
        if name in whole and not lite:
            continue                                               # (...and not the numbered ones another file may still have of the same monster)
        if name == 'ultimus' and not lite or name in (PLAIN if lite else DRAWN):
            kept[file].add(i)
    for file, i in gold.values():
        kept[file].add(i)
    return kept


def slim(doc, blob, drop=(), keep_nodes=None):
    """The same file without what is not wanted: (doc, blob, what went)."""
    went = []
    if keep_nodes is not None:
        for i, name in named(doc):
            if i not in keep_nodes:
                went.append(f'mesh {name}')
                del doc['nodes'][i]['mesh']
    live_meshes = sorted({n['mesh'] for n in doc['nodes'] if 'mesh' in n})
    for m, mesh in enumerate(doc.get('meshes', [])):
        for p in mesh['primitives']:
            for a in drop:
                if a in p['attributes'] and m in live_meshes:
                    del p['attributes'][a]
        if drop and m in live_meshes:
            went.append(f"{'/'.join(drop)} of {mesh.get('name')}")
    # What is still pointed at.
    remap = {m: k for k, m in enumerate(live_meshes)}
    doc['meshes'] = [doc['meshes'][m] for m in live_meshes] if live_meshes else doc.get('meshes', [])
    for n in doc['nodes']:
        if 'mesh' in n:
            n['mesh'] = remap[n['mesh']]
    used = set()
    for mesh in doc.get('meshes', []):
        for p in mesh['primitives']:
            used.update(p['attributes'].values())
            if 'indices' in p: used.add(p['indices'])
            for t in p.get('targets', []): used.update(t.values())
    for a in doc.get('animations', []):
        for s in a['samplers']: used.update((s['input'], s['output']))
    for s in doc.get('skins', []):
        if 'inverseBindMatrices' in s: used.add(s['inverseBindMatrices'])
    acc = sorted(used)
    amap = {a: k for k, a in enumerate(acc)}
    def re_acc(i): return amap[i]
    for mesh in doc.get('meshes', []):
        for p in mesh['primitives']:
            p['attributes'] = {k: re_acc(v) for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = re_acc(p['indices'])
            if 'targets' in p: p['targets'] = [{k: re_acc(v) for k, v in t.items()} for t in p['targets']]
    for a in doc.get('animations', []):
        for s in a['samplers']: s['input'], s['output'] = re_acc(s['input']), re_acc(s['output'])
    for s in doc.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = re_acc(s['inverseBindMatrices'])
    doc['accessors'] = [doc['accessors'][a] for a in acc]
    # The bytes: each buffer view that is still used, once (two that hold the same bytes become one).
    views = sorted({a['bufferView'] for a in doc['accessors'] if 'bufferView' in a} | {im['bufferView'] for im in doc.get('images', []) if 'bufferView' in im})
    out, vmap, new_views, same = bytearray(), {}, [], {}
    for v in views:
        view = doc['bufferViews'][v]
        data = bytes(blob[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']])
        key = (hashlib.sha1(data).digest(), view.get('byteStride'), view.get('target'))
        if key in same:
            vmap[v] = same[key]
            continue
        out += b'\0' * (-len(out) % 4)
        same[key] = vmap[v] = len(new_views)
        new_views.append({**{k: x for k, x in view.items() if k not in ('byteOffset', 'buffer')}, 'buffer': 0, 'byteOffset': len(out)})
        out += data
    for a in doc['accessors']:
        if 'bufferView' in a: a['bufferView'] = vmap[a['bufferView']]
    for im in doc.get('images', []):
        if 'bufferView' in im: im['bufferView'] = vmap[im['bufferView']]
    doc['bufferViews'] = new_views
    if doc.get('buffers'):
        doc['buffers'] = [{'byteLength': len(out)}]
    return doc, bytes(out), went


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    check = '--check' in sys.argv
    names = args or sorted(f for f in os.listdir(HERE) if f.endswith('.glb'))
    kept = looked_for([(f, read(os.path.join(HERE, f))[0]) for f in MONSTERS if os.path.exists(os.path.join(HERE, f))])
    for name in names:
        path = os.path.join(HERE, name)
        rule = RULES.get(name, {})
        doc, blob = read(path)
        before = os.path.getsize(path)
        doc, blob, went = slim(doc, blob, rule.get('drop', ()), kept.get(name) if rule.get('monsters') else None)
        if not check:
            write(path, doc, blob)
        after = 12 + 8 + len(json.dumps(doc, separators=(',', ':'))) + 8 + len(blob)
        print(f'{name}: {before / 1e6:.2f} MB -> {after / 1e6:.2f} MB' + (f'   ({len(went)} things gone: {", ".join(went[:6])}{" ..." if len(went) > 6 else ""})' if went else ''))


if __name__ == '__main__':
    main()
