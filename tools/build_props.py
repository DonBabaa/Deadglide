# Builds the set pieces that are modelled in Blender: public/models/props.glb.
#
#   blender --background --python tools/build_props.py -- public/models/props.glb [preview.png]
#
#   casino_mid, casino_tower, casino_wing, casino_door   the casino from outside (src/world/casinoFront.js: it comes
#                                                        down in pieces, so it is made in pieces; one tower and one
#                                                        wing, used on both sides; one door leaf, hinged at x = 0)
#   portal_frame                                         the exit portal's ring (src/systems/portal.js)
#   power_femur                                          the bone that circles you (src/player/powerups.js)
# Everything is in the game's directions (x right, y up, z forward; the casino faces -z), in metres, with its colours
# (and its light and shade: these are drawn unlit) on its points. Nothing is downloaded.
import bpy, sys, os, math, random, traceback
import numpy as np
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0])
PREVIEW = os.path.abspath(args[1]) if len(args) > 1 else None
B = lambda x, y, z: (x, -z, y)
STONE, SHADE, PALE, ROOF, DARK, GOLD, LIT, IRON, RED = (0.73, 0.67, 0.53), (0.54, 0.49, 0.38), (0.85, 0.8, 0.66), (0.25, 0.5, 0.43), (0.11, 0.09, 0.07), (0.85, 0.65, 0.16), (1.0, 0.81, 0.44), (0.16, 0.16, 0.17), (0.5, 0.08, 0.1)
bag = []          # what is being made: (object, colour, glows)


def only(o):
    for ob in bpy.data.objects:
        ob.select_set(ob is o)
    bpy.context.view_layer.objects.active = o


def put(colour, glows=False, bevel=0.0, smooth=False):
    o = bpy.context.view_layer.objects.active
    only(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        m = o.modifiers.new('bevel', 'BEVEL')
        m.width, m.segments = bevel, 2
        bpy.ops.object.modifier_apply(modifier=m.name)
    if smooth:
        bpy.ops.object.shade_smooth()
    bag.append((o, colour, glows))
    return o


def box(w, h, d, x, y, z, colour, glows=False, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=B(x, y, z), rotation=rot)
    bpy.context.view_layer.objects.active.scale = (w, d, h)
    return put(colour, glows, bevel)


def cyl(r, h, x, y, z, colour, glows=False, r2=None, sides=20, axis='y'):
    rot = {'y': (0, 0, 0), 'z': (math.pi / 2, 0, 0), 'x': (0, math.pi / 2, 0)}[axis]
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r if r2 is None else r2, depth=h, vertices=sides, location=B(x, y, z), rotation=rot)
    return put(colour, glows, smooth=sides > 8)


def ball(r, x, y, z, colour, glows=False, scale=(1, 1, 1), half=False):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=24 if r > 0.6 else 8, ring_count=12 if r > 0.6 else 5, location=B(x, y, z))
    o = bpy.context.view_layer.objects.active
    o.scale = (scale[0], scale[2], scale[1])
    if half:                                  # a dome: the top of it only
        only(o)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.bisect(plane_co=B(x, y, z), plane_no=(0, 0, 1), clear_inner=True, use_fill=True)
        bpy.ops.object.mode_set(mode='OBJECT')
    return put(colour, glows, smooth=True)


def torus(R, r, x, y, z, colour, glows=False, axis='z', seg=28):
    rot = {'y': (0, 0, 0), 'z': (math.pi / 2, 0, 0), 'x': (0, math.pi / 2, 0)}[axis]
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=8, location=B(x, y, z), rotation=rot)
    return put(colour, glows, smooth=True)


def finish(name, sun=(0.35, 0.8, -0.5)):
    """Join what has been made into one mesh, its colours on its points: each piece's own, lit from up and in front
    (unless it glows), darker toward the ground and in its creases."""
    global bag
    L = np.array(B(*sun)); L /= np.linalg.norm(L)
    for o, colour, glows in bag:
        mesh = o.data
        layer = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        n = len(mesh.loops)
        normals = np.empty(len(mesh.polygons) * 3); mesh.polygons.foreach_get('normal', normals); normals = normals.reshape(-1, 3)
        counts = np.empty(len(mesh.polygons), dtype=np.int32); mesh.polygons.foreach_get('loop_total', counts)
        per = np.repeat(normals, counts, axis=0)
        which = np.empty(n, dtype=np.int32); mesh.loops.foreach_get('vertex_index', which)
        co = np.empty(len(mesh.vertices) * 3); mesh.vertices.foreach_get('co', co); height = co.reshape(-1, 3)[which, 2]
        if glows:
            shade = np.full(n, 1.15)
        else:
            shade = 0.5 + 0.55 * np.clip(per @ L, -0.3, 1) + 0.12 * np.clip(per[:, 2], 0, 1)
            shade *= 0.82 + 0.18 * np.clip(height / 6.0, 0, 1)                                                     # grime at its foot
            shade *= 0.93 + 0.14 * np.random.default_rng(len(bag) + n).random(n)                                   # and stone is not one colour
        rgb = np.clip(np.outer(shade, colour), 0, 1.3) ** 2.2
        layer.data.foreach_set('color', np.concatenate([rgb, np.ones((n, 1))], 1).ravel())
    objs = [o for o, _, _ in bag]
    for o in bpy.data.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    objs[0].name = name
    bag = []
    return objs[0]


def window(x, y, z, w, h, arched=True, panes=(2, 3), frame=PALE, sill=True, balcony=False):
    """A lit window in a stone surround: glazing bars, a moulded frame, an arch and keystone over it, a sill."""
    box(w, h, 0.3, x, y, z, LIT, True)
    for i in range(1, panes[0]):
        box(0.09, h, 0.34, x - w / 2 + i * w / panes[0], y, z - 0.03, DARK)
    for j in range(1, panes[1]):
        box(w, 0.09, 0.34, x, y - h / 2 + j * h / panes[1], z - 0.03, DARK)
    for sd in (-1, 1):
        box(0.34, h + 0.3, 0.5, x + sd * (w / 2 + 0.17), y, z - 0.12, frame, bevel=0.04)
    top = y + h / 2
    if arched:
        cyl(w / 2, 0.3, x, top, z, LIT, True, axis='z', sides=28)
        for k in range(1, 4):
            a = k * math.pi / 4
            box(0.08, w / 2, 0.34, x + math.cos(a) * w / 4, top + math.sin(a) * w / 4, z - 0.03, DARK, rot=(0, -(a - math.pi / 2), 0))
        torus(w / 2 + 0.17, 0.2, x, top, z - 0.14, frame, axis='z')
        box(0.5, 0.75, 0.6, x, top + w / 2 + 0.2, z - 0.2, frame, bevel=0.05)                    # keystone
    else:
        box(w + 0.9, 0.34, 0.6, x, top + 0.2, z - 0.14, frame, bevel=0.05)
    if sill:
        box(w + 0.9, 0.3, 0.8, x, y - h / 2 - 0.15, z - 0.25, frame, bevel=0.05)
    if balcony:
        box(w + 1.4, 0.3, 1.5, x, y - h / 2 - 0.45, z - 0.75, SHADE, bevel=0.05)
        for i in range(int((w + 1.2) / 0.4) + 1):
            cyl(0.07, 0.9, x - (w + 1.2) / 2 + i * 0.4, y - h / 2 + 0.15, z - 1.4, IRON, sides=6)
        box(w + 1.4, 0.1, 0.14, x, y - h / 2 + 0.62, z - 1.4, GOLD)


def balustrade(x0, x1, y, z, colour=PALE):
    n = int((x1 - x0) / 0.7)
    for i in range(n + 1):
        cyl(0.13, 0.9, x0 + i * (x1 - x0) / n, y + 0.45, z, colour, r2=0.09, sides=8)
    box(x1 - x0 + 0.4, 0.22, 0.42, (x0 + x1) / 2, y + 0.98, z, colour, bevel=0.03)
    box(x1 - x0 + 0.4, 0.2, 0.42, (x0 + x1) / 2, y + 0.02, z, colour)


def column(x, y0, h, z, r=0.75):
    """A column: a square base, a fluted shaft that narrows, a capital with a roll under a square top."""
    box(r * 2.9, 0.9, r * 2.9, x, y0 + 0.45, z, SHADE, bevel=0.06)
    torus(r * 1.12, 0.16, x, y0 + 1.0, z, PALE, axis='y')
    cyl(r, h - 2.2, x, y0 + 1.1 + (h - 2.2) / 2, z, PALE, r2=r * 0.85, sides=24)
    for k in range(12):
        a = k * math.pi / 6
        cyl(0.075, h - 3.0, x + math.cos(a) * r * 0.93, y0 + 1.1 + (h - 2.2) / 2, z + math.sin(a) * r * 0.93, SHADE, sides=6)
    torus(r * 0.98, 0.17, x, y0 + h - 1.1, z, PALE, axis='y')
    for sd in (-1, 1):
        cyl(0.3, r * 2.5, x, y0 + h - 0.72, z + sd * r * 0.9, GOLD, axis='x', sides=12)                  # the scrolls of its capital
    box(r * 2.8, 0.42, r * 2.8, x, y0 + h - 0.21, z, PALE, bevel=0.05)


def bulbs(x0, x1, y, z, every=0.9):
    for i in range(int((x1 - x0) / every) + 1):
        ball(0.13, x0 + i * every, y, z, LIT, True)


def casino_mid():
    box(30, 28, 6, 0, 14, 3, STONE)
    box(72, 21, 30, 0, 10.5, 21, SHADE)
    box(74, 2.5, 32, 0, 22, 21, ROOF)
    for i in range(6):                                           # the ground floor: banded stone
        box(30.1, 0.14, 0.14, 0, 1.2 + i * 1.15, -0.02, SHADE)
    box(30.6, 0.5, 6.6, 0, 7.6, 3, PALE, bevel=0.06)             # a string course over it
    # the cornice, the teeth under it, the attic and its balustrade
    box(32, 1.2, 7.4, 0, 28.6, 3, PALE, bevel=0.1)
    for i in range(60):
        box(0.3, 0.42, 0.4, -14.75 + i * 0.5, 27.75, -0.35, PALE)
    box(30.4, 0.5, 6.6, 0, 26.6, 3, SHADE, bevel=0.05)
    box(30, 3.5, 6, 0, 31, 3.2, ROOF)
    balustrade(-15.6, -6.6, 29.2, -0.5)
    balustrade(6.6, 15.6, 29.2, -0.5)
    for sd in (-1, 1):                                           # an urn on each corner
        box(1.1, 1.3, 1.1, sd * 15.3, 29.85, -0.5, PALE, bevel=0.05)
        ball(0.5, sd * 15.3, 31.0, -0.5, GOLD, scale=(1, 1.2, 1))
        cyl(0.2, 0.5, sd * 15.3, 31.7, -0.5, GOLD, r2=0.42, sides=12)
    # the clock, in its gable; the dome behind it, with a lantern and a spire
    box(12, 7.5, 1.6, 0, 33, 0.6, STONE, bevel=0.08)
    box(13.2, 0.7, 2.2, 0, 36.9, 0.6, PALE, bevel=0.08)
    for sd in (-1, 1):
        box(1.0, 7.5, 1.9, sd * 5.6, 33, 0.5, PALE, bevel=0.06)
    cyl(2.3, 0.2, 0, 33.4, -0.25, LIT, True, axis='z', sides=36)
    torus(2.45, 0.22, 0, 33.4, -0.3, GOLD, axis='z', seg=36)
    for k in range(12):
        a = k * math.pi / 6
        box(0.12, 0.45 if k % 3 else 0.7, 0.1, math.sin(a) * 1.95, 33.4 + math.cos(a) * 1.95, -0.38, DARK, rot=(0, a, 0))
    box(0.16, 1.5, 0.1, 0.28, 34.0, -0.4, DARK, rot=(0, 0.4, 0))    # (it has stopped at five to midnight)
    box(0.12, 1.9, 0.1, -0.2, 34.3, -0.42, DARK, rot=(0, -0.2, 0))
    ball(6, 0, 33, 5, ROOF, half=True)
    torus(6.0, 0.25, 0, 33.1, 5, GOLD, axis='y', seg=40)
    for k in range(10):
        a = k * math.pi / 5
        for j in range(7):
            t = (j + 0.5) / 7 * math.pi / 2
            ball(0.2, math.cos(a) * 6.05 * math.cos(t), 33 + 6.05 * math.sin(t), 5 + math.sin(a) * 6.05 * math.cos(t), GOLD, scale=(1, 2.4, 1))
    cyl(1.1, 2.2, 0, 40.0, 5, PALE, sides=12)
    ball(1.2, 0, 41.1, 5, ROOF, half=True)
    cyl(0.16, 4.0, 0, 44.0, 5, GOLD, r2=0.02, sides=8)
    ball(0.3, 0, 42.4, 5, GOLD)
    # three tall arched windows over a balcony each; the side doors under two of them
    for x in (-9, 0, 9):
        window(x, 14.4, -0.1, 5, 11.2, panes=(3, 5), balcony=True)
        if x:
            box(4, 5.6, 0.4, x, 2.8, -0.1, DARK)
            for sd in (-1, 1):
                box(0.4, 6.0, 0.6, x + sd * 2.2, 3.0, -0.2, PALE, bevel=0.05)
                box(1.55, 2.0, 0.1, x + sd * 0.95, 4.2, -0.34, (0.2, 0.15, 0.1))
                box(1.55, 2.3, 0.1, x + sd * 0.95, 1.6, -0.34, (0.2, 0.15, 0.1))
                ball(0.11, x + sd * 0.22, 2.8, -0.42, GOLD)
            box(5.2, 0.5, 0.9, x, 6.05, -0.25, PALE, bevel=0.06)
            ball(0.3, x - 2.75, 4.6, -0.75, LIT, True)
            ball(0.3, x + 2.75, 4.6, -0.75, LIT, True)
    # the middle doors: the light of the room behind them, and their surround
    box(4, 5.6, 0.2, 0, 2.8, 0.5, LIT, True)
    for sd in (-1, 1):
        box(0.5, 6.2, 0.8, sd * 2.3, 3.1, -0.25, PALE, bevel=0.06)
    box(5.6, 0.6, 1.0, 0, 6.2, -0.3, PALE, bevel=0.08)
    # four great columns, the canopy between them hung with bulbs, the steps
    for x in (-13.6, -4.5, 4.5, 13.6):
        column(x, 1.0, 25.4, -1.3)
    box(27, 0.5, 5, 0, 6.75, -2.4, RED, bevel=0.06)
    box(27.2, 0.9, 0.3, 0, 6.6, -4.9, GOLD, bevel=0.05)
    bulbs(-13.2, 13.2, 6.05, -4.95, 0.66)
    for sd in (-1, 1):
        box(0.3, 0.9, 5, sd * 13.5, 6.6, -2.4, GOLD, bevel=0.05)
    for i, (w, d, y) in enumerate([(36, 9, 0.17), (34, 7.6, 0.5), (32, 6.2, 0.83)]):
        box(w, 0.34, d, 0, y, -d / 2 + 0.4, PALE if i == 2 else SHADE, bevel=0.03)
    box(4.4, 0.06, 6.4, 0, 1.03, -2.9, RED)                      # the carpet
    # the sign: a board in a gold frame, ringed with bulbs (the letters are put on it in the game)
    box(15.8, 3.5, 0.3, 0, 25.2, -0.12, DARK)
    for sd in (-1, 1):
        box(16.2, 0.25, 0.5, 0, 25.2 + sd * 1.85, -0.2, GOLD, bevel=0.04)
        box(0.25, 3.9, 0.5, sd * 8.0, 25.2, -0.2, GOLD, bevel=0.04)
        bulbs(-7.6, 7.6, 25.2 + sd * 1.6, -0.36, 0.8)
    return finish('casino_mid')


def casino_door():
    """One leaf of the middle doors, hinged at x = 0, 2 m wide: panelled, with a brass handle and a kick plate."""
    box(2, 5.6, 0.3, 1, 0, 0, DARK, bevel=0.03)
    for y, h in ((1.35, 2.3), (-1.3, 2.4)):
        box(1.5, h, 0.08, 1, y, -0.17, (0.22, 0.16, 0.1), bevel=0.03)
        box(1.1, h - 0.4, 0.06, 1, y, -0.22, (0.3, 0.21, 0.12), bevel=0.02)
    box(1.9, 0.5, 0.06, 1, -2.5, -0.18, GOLD)
    cyl(0.05, 1.2, 1.75, 0.1, -0.3, GOLD, sides=10)
    return finish('casino_door')


def casino_tower():
    box(8, 44, 7, 0, 22, 3.5, STONE)
    for i in range(22):                                          # the stones of its corners
        for sd in (-1, 1):
            box(1.3 if i % 2 else 0.9, 0.9, 0.3, sd * (4 - (0.65 if i % 2 else 0.45)), 1 + i * 2, -0.06, PALE, bevel=0.04)
    for y in (9, 19, 29, 37):
        box(8.5, 0.5, 7.5, 0, y, 3.5, PALE, bevel=0.06)
    for y in (13.2, 23.2, 32.6):
        window(0, y, -0.1, 2.6, 4.6, panes=(2, 3), balcony=y == 23.2)
    cyl(1.4, 0.3, 0, 40.4, -0.1, LIT, True, axis='z', sides=28)
    torus(1.55, 0.22, 0, 40.4, -0.2, PALE, axis='z')
    for a in (0, math.pi / 2, math.pi / 4, -math.pi / 4):
        box(0.1, 2.8, 0.34, 0, 40.4, -0.14, DARK, rot=(0, a, 0))
    box(9.6, 1.1, 8.6, 0, 44.5, 3.5, PALE, bevel=0.1)
    for i in range(18):
        box(0.3, 0.4, 0.4, -4.25 + i * 0.5, 43.75, -0.6, PALE)
    # the belfry: open arches between little columns; the copper dome, ribbed; the lantern; the spire
    box(6.5, 7, 6, 0, 48.5, 3.5, STONE)
    window(0, 48.0, 0.3, 2.2, 3.6, panes=(1, 1), sill=False)
    for sd in (-1, 1):
        cyl(0.3, 6.4, sd * 3.0, 48.5, 0.6, PALE, sides=12)
        box(0.9, 0.4, 0.9, sd * 3.0, 51.9, 0.6, PALE, bevel=0.04)
    box(7.4, 0.6, 6.9, 0, 52.2, 3.5, PALE, bevel=0.08)
    ball(4.2, 0, 52.4, 3.5, ROOF, scale=(1, 1.5, 1), half=True)
    for k in range(8):
        a = k * math.pi / 4
        for j in range(6):
            t = (j + 0.5) / 6 * math.pi / 2
            ball(0.18, math.cos(a) * 4.25 * math.cos(t), 52.4 + 6.3 * math.sin(t), 3.5 + math.sin(a) * 4.25 * math.cos(t), GOLD, scale=(1, 2.2, 1))
    cyl(0.8, 1.6, 0, 59.2, 3.5, PALE, sides=10)
    ball(0.9, 0, 60.0, 3.5, ROOF, half=True)
    cyl(0.3, 6.5, 0, 63.8, 3.5, GOLD, r2=0.02, sides=8)
    ball(0.42, 0, 61.1, 3.5, GOLD)
    return finish('casino_tower')


def casino_wing():
    box(14, 20, 5, 0, 10, 2.5, STONE)
    for i in range(6):
        box(14.1, 0.14, 0.14, 0, 1.2 + i * 1.15, -0.02, SHADE)
    box(14.5, 0.5, 5.5, 0, 9.4, 2.5, PALE, bevel=0.06)
    for x in (-4, 0, 4):
        window(x, 5.3, -0.1, 2.4, 4.4, panes=(2, 2), arched=False)
        window(x, 14.0, -0.1, 2.4, 5.0, panes=(2, 3), balcony=True)
    for x in (-6.4, -2, 2, 6.4):                                 # flat columns between the windows
        box(0.8, 9.6, 0.4, x, 14.6, -0.15, PALE, bevel=0.05)
        box(1.1, 0.5, 0.6, x, 19.6, -0.2, PALE, bevel=0.05)
    box(15, 1, 6, 0, 20.5, 2.5, PALE, bevel=0.1)
    for i in range(28):
        box(0.3, 0.4, 0.4, -6.75 + i * 0.5, 19.8, -0.5, PALE)
    box(14, 3, 5, 0, 22.5, 2.6, ROOF)
    for x in (-4, 0, 4):                                         # dormers in the roof
        box(1.8, 2.0, 1.2, x, 22.6, -0.2, STONE, bevel=0.05)
        box(1.1, 1.3, 0.2, x, 22.6, -0.82, LIT, True)
        box(2.2, 0.3, 1.5, x, 23.75, -0.25, ROOF, bevel=0.05)
    balustrade(-7, 7, 21.0, -0.3)
    return finish('casino_wing')


def portal_frame():
    """The way out: a ring of broken stone, 3.4 m in radius, standing upright (in the x-y plane). Sixteen great
    blocks, no two alike, cracked and fanged, a band of runes burning round its inside."""
    rnd = random.Random(5)
    R, GREEN = 3.4, (0.62, 1.0, 0.78)
    for k in range(16):
        a = k * math.pi / 8 + rnd.uniform(-0.05, 0.05)
        r = R + rnd.uniform(-0.08, 0.12)
        w, h, d = rnd.uniform(1.05, 1.4), rnd.uniform(0.6, 0.85), rnd.uniform(0.5, 0.8)
        box(w, h, d, math.cos(a) * r, math.sin(a) * r, 0, (0.13, 0.16, 0.15), bevel=0.07, rot=(rnd.uniform(-0.12, 0.12), -(a + math.pi / 2) + rnd.uniform(-0.08, 0.08), 0))
        # a fang of stone off its back, outward
        bpy.ops.mesh.primitive_cone_add(radius1=rnd.uniform(0.16, 0.26), radius2=0, depth=rnd.uniform(0.6, 1.2), vertices=5, location=B(math.cos(a) * (r + 0.6), math.sin(a) * (r + 0.6), rnd.uniform(-0.1, 0.1)), rotation=(0, -(a - math.pi / 2), 0))
        put((0.09, 0.11, 0.1))
        # its rune: a mark cut into its face, on both sides, alight
        for z in (-d / 2 - 0.01, d / 2 + 0.01):
            box(0.09, h * 0.62, 0.05, math.cos(a) * r, math.sin(a) * r, z, GREEN, True, rot=(0, -(a + math.pi / 2), 0))
            box(0.34, 0.08, 0.05, math.cos(a) * (r + 0.1 * (k % 3 - 1)), math.sin(a) * (r + 0.1 * (k % 3 - 1)), z, GREEN, True, rot=(0, -(a + math.pi / 2) + 0.5 * (k % 2 * 2 - 1), 0))
    torus(R - 0.42, 0.06, 0, 0, 0, GREEN, True, axis='z', seg=64)
    torus(R + 0.02, 0.09, 0, 0, 0.36, (0.2, 0.5, 0.36), True, axis='z', seg=64)
    return finish('portal_frame', sun=(0.3, 0.6, 0.7))


def power_femur():
    """A thigh bone, 1.9 m long, standing up: a shaft that swells to a double knuckle at each end."""
    BONE = (0.87, 0.83, 0.72)
    cyl(0.13, 1.5, 0, 0, 0, BONE, r2=0.11, sides=16)
    for y in (-0.82, 0.82):
        cyl(0.11 if y > 0 else 0.13, 0.3, 0, y, 0, BONE, r2=0.2 if y > 0 else 0.11, sides=16) if y > 0 else cyl(0.2, 0.3, 0, y, 0, BONE, r2=0.13, sides=16)
        for x in (-0.13, 0.13):
            ball(0.22, x, y * 1.16, 0, BONE, scale=(1, 0.9, 1.05))
    return finish('power_femur', sun=(0.3, 0.5, 0.8))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    made = []
    for build in (casino_mid, casino_door, casino_tower, casino_wing, portal_frame, power_femur):
        try:
            o = build()
            made.append(o)
            print('MESH', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), 'tris', [round(d, 2) for d in o.dimensions])
        except Exception:
            print('FAILED', build.__name__)
            traceback.print_exc()
    if PREVIEW:
        scene = bpy.context.scene
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        scene.collection.objects.link(cam)
        scene.camera = cam
        by = {o.name: o for o in made}
        for name, eye, look, shown in (('casino', (-30, 95, 16), (0, 0, 26), ('casino_mid', 'casino_tower', 'casino_wing')), ('portal', (3, 11, 1), (0, 0, 0), ('portal_frame',))):
            for o in made:
                o.hide_render = o.name not in shown
            if name == 'casino':
                by['casino_tower'].location.x, by['casino_wing'].location.x = 19, 30
            else:
                by['portal_frame'].rotation_euler = (math.pi / 2, 0, 0)
            cam.location = eye
            cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
            scene.render.resolution_x, scene.render.resolution_y = 1000, 800
            scene.render.filepath = PREVIEW.replace('.png', f'_{name}.png')
            scene.render.engine = 'BLENDER_WORKBENCH'
            scene.display.shading.light = 'FLAT'
            scene.display.shading.color_type = 'VERTEX'
            bpy.ops.render.render(write_still=True)
        by['casino_tower'].location.x = by['casino_wing'].location.x = 0
        by['portal_frame'].rotation_euler = (0, 0, 0)
    for o in bpy.data.objects:
        o.select_set(o in made)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_yup=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_materials='PLACEHOLDER', export_texcoords=False)
    print('EXPORTED', OUT, os.path.getsize(OUT))


try:
    main()
except Exception:
    traceback.print_exc()
