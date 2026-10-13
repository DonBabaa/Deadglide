# Builds the guns that are modelled in Blender: public/models/guns.glb (so far: the pistol).
#
#   blender --background --python tools/build_guns.py -- public/models/guns.glb [preview.png]
#
# Each gun is a few meshes called <gun>_<finish>, where the finish is which of the game's materials it takes:
# Metal (the main finish: the one the gold skin repaints), Steel (bare bright parts), Polymer (black furniture).
# A gun is built round its grip: the hand holds it at the origin, the barrel runs along the game's +Z a little above
# the hand, up is +Y, in metres (src/player/gunModels.js scales it and puts it in his hand). All made here: nothing
# is downloaded.
import bpy, bmesh, sys, os, math, traceback
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
OUT = os.path.abspath(args[0])
PREVIEW = os.path.abspath(args[1]) if len(args) > 1 else None
B = lambda x, y, z: (x, -z, y)          # the game's (right, up, forward) in Blender's


def only(o):
    for ob in bpy.data.objects:
        ob.select_set(ob is o)
    bpy.context.view_layer.objects.active = o


def done(o, bevel=0.0, smooth=True):
    only(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        m = o.modifiers.new('bevel', 'BEVEL')
        m.width, m.segments, m.limit_method, m.angle_limit = bevel, 3, 'ANGLE', math.radians(35)
        bpy.ops.object.modifier_apply(modifier=m.name)
    if smooth:
        bpy.ops.object.shade_smooth()
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception:
            pass
    return o


def box(w, h, d, x, y, z, bevel=0.0015, tilt=0.0):
    """w across, h tall, d along the barrel, its middle at (x, y, z); tilt: leaned back about the across axis (rad)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=B(x, y, z), rotation=(tilt, 0, 0))
    o = bpy.context.view_layer.objects.active
    o.scale = (w, d, h)
    return done(o, bevel)


def tube(r, z0, z1, y, x=0.0, r2=None, sides=32, bevel=0.0008):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r if r2 is None else r2, depth=z1 - z0, vertices=sides, location=B(x, y, (z0 + z1) / 2), rotation=(math.pi / 2, 0, 0))
    return done(bpy.context.view_layer.objects.active, bevel)


def across(r, w, y, z, x=0.0, sides=20, bevel=0.0005):
    """A pin, a screw head, a button: a short cylinder lying across the gun."""
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=w, vertices=sides, location=B(x, y, z), rotation=(0, math.pi / 2, 0))
    return done(bpy.context.view_layer.objects.active, bevel)


def cut(o, cutters):
    for c in cutters:
        m = o.modifiers.new('cut', 'BOOLEAN')
        m.operation, m.object, m.solver = 'DIFFERENCE', c, 'EXACT'
        only(o)
        bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.data.objects.remove(c, do_unlink=True)
    return o


def join(name, pieces):
    for o in bpy.data.objects:
        o.select_set(o in pieces)
    bpy.context.view_layer.objects.active = pieces[0]
    if len(pieces) > 1:
        bpy.ops.object.join()
    o = pieces[0]
    o.name = name
    o.data.materials.clear()
    o.data.materials.append(bpy.data.materials.get(name.split('_')[1]) or bpy.data.materials.new(name.split('_')[1]))
    return o


def pistol():
    """A service pistol in the pattern of the old .45s: a long slide over a steel frame, a spur hammer, a grip safety,
    chequered grip panels held by two screws each. Slide along z from -0.045 to 0.165, its top at y = 0.072."""
    metal, steel, polymer = [], [], []
    # ---- The slide ----
    slide = box(0.030, 0.034, 0.210, 0, 0.055, 0.060, bevel=0.0028)
    top = box(0.018, 0.006, 0.200, 0, 0.0735, 0.060, bevel=0.0015)                       # the flat rib along its top
    cut(slide, [box(0.012, 0.016, 0.034, 0.011, 0.062, 0.070, bevel=0)]                  # the port the empties come out of
        + [box(0.034, 0.024, 0.0022, 0, 0.056, -0.036 + i * 0.0052, bevel=0, tilt=0.2) for i in range(8)]       # the grooves you rack it by, at the back...
        + [box(0.034, 0.024, 0.0022, 0, 0.056, 0.118 + i * 0.0052, bevel=0, tilt=0.2) for i in range(5)]        # ...and at the front
        + [tube(0.0075, 0.150, 0.170, 0.058, sides=20, bevel=0), tube(0.0045, 0.150, 0.170, 0.043, sides=16, bevel=0)])   # the holes the barrel and the spring guide come through
    done(slide, 0.0006)
    metal += [slide, top]
    steel += [box(0.0125, 0.0165, 0.033, 0.0105, 0.062, 0.070, bevel=0.0005)]            # the barrel's hood, seen through the port
    # sights: a blade in front, a notched block behind, three white dots' worth of detail left to the eye
    metal += [box(0.004, 0.008, 0.012, 0, 0.0795, 0.150, bevel=0.0008, tilt=-0.25)]
    rear = box(0.022, 0.009, 0.014, 0, 0.0795, -0.030, bevel=0.0008)
    cut(rear, [box(0.005, 0.008, 0.02, 0, 0.0815, -0.030, bevel=0)])
    metal += [done(rear)]
    # ---- The barrel, its bushing, the recoil spring's plug ----
    steel += [tube(0.0068, 0.120, 0.171, 0.058), tube(0.0042, 0.168, 0.1715, 0.058, r2=0.0036)]
    bore = tube(0.0044, 0.1705, 0.1725, 0.058, sides=20, bevel=0)
    polymer += [bore]                                                                    # (the dark of the bore)
    metal += [tube(0.0092, 0.156, 0.1665, 0.058, sides=24), tube(0.0052, 0.158, 0.1675, 0.043, sides=20)]
    # ---- The frame ----
    frame = box(0.027, 0.020, 0.165, 0, 0.030, 0.045, bevel=0.002)                       # the rails the slide runs on, and the dust cover under the barrel
    cut(frame, [box(0.03, 0.006, 0.036, 0, 0.020, 0.108 + i * 0.0 , bevel=0) for i in range(1)])
    metal += [done(frame, 0.0005)]
    metal += [box(0.027, 0.012, 0.050, 0, 0.022, 0.100, bevel=0.002)]                    # the accessory rail's block...
    for i in range(4):                                                                   # ...and its slots
        metal += [box(0.0285, 0.004, 0.0045, 0, 0.0155, 0.082 + i * 0.011, bevel=0.0006)]
    # the grip: leaned back, with a flared mouth for the magazine
    grip = box(0.027, 0.105, 0.046, 0, -0.030, -0.018, bevel=0.004, tilt=0.2)
    metal += [grip]
    metal += [box(0.029, 0.008, 0.052, 0, -0.083, -0.029, bevel=0.002, tilt=0.2)]       # the mouth of the magazine well
    steel += [box(0.022, 0.010, 0.044, 0, -0.091, -0.0305, bevel=0.002, tilt=0.2)]      # the magazine's base
    polymer += [box(0.024, 0.006, 0.046, 0, -0.098, -0.032, bevel=0.002, tilt=0.2)]     # ...and the bumper on it
    # the front and back straps: grooved up the front, a grip safety and a housing down the back
    for i in range(9):
        metal += [box(0.022, 0.0028, 0.003, 0, -0.068 + i * 0.0085, 0.0045 + (-0.068 + i * 0.0085 + 0.03) * 0.203, bevel=0.0008)]
    steel += [box(0.020, 0.040, 0.008, 0, -0.012, -0.0445, bevel=0.003, tilt=0.2)]      # the grip safety
    metal += [box(0.022, 0.046, 0.007, 0, -0.058, -0.0535, bevel=0.002, tilt=0.2)]      # the mainspring housing
    metal += [box(0.016, 0.012, 0.030, 0, 0.022, -0.058, bevel=0.004, tilt=0.35)]        # the beaver tail over the web of his hand
    # the trigger guard: a bow under the frame, squared at the front
    bpy.ops.mesh.primitive_torus_add(major_radius=0.0195, minor_radius=0.0038, major_segments=28, minor_segments=10, location=B(0, 0.002, 0.048), rotation=(0, math.pi / 2, 0))
    guard = bpy.context.view_layer.objects.active
    guard.scale = (1, 1.35, 0.95)
    done(guard, 0)
    cut(guard, [box(0.02, 0.03, 0.09, 0, 0.034, 0.048, bevel=0)])                        # (the top half of it is inside the frame)
    metal += [done(guard)]
    # the trigger: a long curved blade, with three holes through it
    trig = box(0.007, 0.022, 0.007, 0, 0.006, 0.044, bevel=0.002, tilt=0.25)
    cut(trig, [across(0.0018, 0.02, 0.012 - i * 0.006, 0.0452 - i * 0.0014, bevel=0) for i in range(3)])
    steel += [done(trig, 0.0003)]
    # the hammer: a spur with a ring through it, cocked
    ham = box(0.0085, 0.022, 0.012, 0, 0.060, -0.052, bevel=0.0025, tilt=0.75)
    cut(ham, [across(0.0034, 0.02, 0.064, -0.0575, bevel=0)])
    steel += [done(ham, 0.0003)]
    # the controls on its left side: slide stop, thumb safety, magazine catch, take-down pin; and on the right, the pin's other end
    steel += [box(0.004, 0.006, 0.030, -0.0155, 0.036, 0.034, bevel=0.0015), across(0.0042, 0.004, 0.036, 0.050, x=-0.0155),
              box(0.005, 0.007, 0.024, -0.016, 0.040, -0.030, bevel=0.002, tilt=0.12), across(0.0038, 0.003, 0.036, -0.036, x=-0.0155),
              across(0.0042, 0.005, 0.012, 0.022, x=-0.0155), across(0.0026, 0.031, 0.036, 0.050), across(0.002, 0.030, 0.024, -0.040), across(0.002, 0.030, 0.012, -0.046)]
    # ---- The grip panels: chequered, a border left plain round the chequering, two screws each ----
    for sd in (-1, 1):
        panel = box(0.005, 0.078, 0.040, sd * 0.0152, -0.036, -0.0195, bevel=0.0022, tilt=0.2)
        lines = []
        mid = Vector(B(sd * 0.0185, -0.036, -0.0195))
        for i in range(-12, 13):
            for lean in (-1, 1):
                c = box(0.0035, 0.14, 0.0012, sd * 0.0185, -0.036, -0.0195, bevel=0)
                c.data.transform(Matrix.Translation(mid) @ Matrix.Rotation(lean * 0.6 - 0.2, 4, 'X') @ Matrix.Translation((0, -i * 0.0046, 0)) @ Matrix.Translation(-mid))
                lines.append(c)
        cut(panel, lines)
        polymer += [done(panel, 0)]
        for dy, dz in ((0.018, 0.004), (-0.022, -0.0045)):
            screw = across(0.0036, 0.0022, -0.036 + dy, -0.0195 + dz, x=sd * 0.0178)
            cut(screw, [box(0.004, 0.0009, 0.009, sd * 0.019, -0.036 + dy, -0.0195 + dz, bevel=0)])
            steel += [screw]
    return [join('pistol_Metal', metal), join('pistol_Steel', steel), join('pistol_Polymer', polymer)]


def ring(r, thick, y, z, x=0.0, seg=28):
    """A band round the barrel (its axis along the gun)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=thick, major_segments=seg, minor_segments=8, location=B(x, y, z), rotation=(math.pi / 2, 0, 0))
    return done(bpy.context.view_layer.objects.active, 0)


def orb(r, x, y, z, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=18, ring_count=10, location=B(x, y, z))
    o = bpy.context.view_layer.objects.active
    o.scale = (scale[0], scale[2], scale[1])
    return done(o, 0)


def upright(r, h, x, y, z, r2=None, sides=20, lean=0.0, bevel=0.0006):
    """A cylinder standing up (a drum, a turret, a leg), leaned back by `lean`."""
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r if r2 is None else r2, depth=h, vertices=sides, location=B(x, y, z), rotation=(lean, 0, 0))
    return done(bpy.context.view_layer.objects.active, bevel)


def guard(z=0.045):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.0215, minor_radius=0.004, major_segments=28, minor_segments=10, location=B(0, 0.0, z), rotation=(0, math.pi / 2, 0))
    g = bpy.context.view_layer.objects.active
    g.scale = (1, 1.35, 0.95)
    done(g, 0)
    cut(g, [box(0.02, 0.03, 0.1, 0, 0.034, z, bevel=0)])
    return done(g)


def trigger(z=0.04):
    return box(0.006, 0.022, 0.007, 0, -0.006, z, bevel=0.002, tilt=0.3)


def grip(lean=0.22, length=0.115, grooves=6):
    """A pistol grip: leaned back, grooved down its front, a cap on its foot."""
    out = [box(0.034, length, 0.05, 0, -0.055, -0.012, bevel=0.006, tilt=lean)]
    for i in range(grooves):
        yy = -0.02 - i * (length - 0.04) / max(1, grooves - 1)
        out.append(box(0.036, 0.004, 0.006, 0, yy, 0.012 + yy * math.tan(lean) * -1 - 0.012, bevel=0.001, tilt=lean))
    return out


def rail(z0, z1, y, slots=None, w=0.022):
    """An accessory rail along the top: a raised strip, cross-slotted."""
    n = slots or max(3, int((z1 - z0) / 0.012))
    out = [box(w, 0.006, z1 - z0, 0, y, (z0 + z1) / 2, bevel=0.001)]
    for i in range(n):
        out.append(box(w + 0.004, 0.005, (z1 - z0) / n * 0.55, 0, y + 0.005, z0 + (i + 0.5) * (z1 - z0) / n, bevel=0.0008))
    return out


def stock(z0, z1, y, h, w=0.04, pad=True):
    """A shoulder stock from z0 back to z1: the body of it, a cheek piece, a rubber pad."""
    out = {'Polymer': [box(w, h, z0 - z1, 0, y, (z0 + z1) / 2, bevel=0.008), box(w * 0.8, h * 0.3, (z0 - z1) * 0.6, 0, y + h * 0.55, (z0 + z1) / 2, bevel=0.006)]}
    if pad:
        out['Rubber'] = [box(w * 1.1, h * 1.12, 0.018, 0, y - h * 0.03, z1 - 0.006, bevel=0.005)] + [box(w * 1.12, 0.004, 0.02, 0, y - h * 0.45 + i * h * 0.15, z1 - 0.006, bevel=0.001) for i in range(7)]
    return out


def gather(name, *groups):
    """Join what has been made, by finish: gather('sniper', {'Metal': [...]}, {'Steel': [...]}) -> meshes called sniper_Metal, ..."""
    by = {}
    for g in groups:
        for finish, pieces in g.items():
            by.setdefault('Polymer' if finish == 'Rubber' else finish, []).extend(pieces)
    return [join(f'{name}_{finish}', pieces) for finish, pieces in by.items() if pieces]


def pins(spots, r=0.0028, w=0.05):
    return [across(r, w, y, z) for y, z in spots]


def machine_gun():
    """An assault rifle: a flat-topped receiver with a rail and a carry handle, a vented handguard, a curved
    magazine, a telescoping stock on a buffer tube."""
    rec = box(0.046, 0.07, 0.3, 0, 0.04, 0.07, bevel=0.004)
    cut(rec, [box(0.02, 0.022, 0.07, 0.02, 0.052, 0.09, bevel=0)])                                     # the ejection port
    metal = [done(rec, 0.0006), tube(0.016, 0.57, 0.63, 0.045, r2=0.018), box(0.008, 0.045, 0.02, 0, 0.082, 0.47, bevel=0.002),
             box(0.02, 0.022, 0.2, 0, 0.094, 0.07, bevel=0.004), box(0.012, 0.03, 0.02, 0, 0.082, 0.16, bevel=0.002), box(0.012, 0.03, 0.02, 0, 0.082, -0.02, bevel=0.002),
             tube(0.016, -0.3, -0.08, 0.045), box(0.03, 0.02, 0.05, 0, 0.0, 0.11, bevel=0.003), guard(0.05)]
    metal += [box(0.012, 0.012, 0.03, -0.028, 0.06, -0.02, bevel=0.003)]                              # charging handle
    metal += [box(0.05, 0.01, 0.014, 0, 0.08, 0.57 + i * 0.016, bevel=0) for i in range(0)]
    metal += pins([(0.02, 0.0), (0.02, 0.15), (0.05, 0.19), (0.03, -0.06)])
    slots = [box(0.06, 0.006, 0.004, 0, 0.045 + j * 0.012, 0.585 + i * 0.012, bevel=0) for i in range(3) for j in (-1, 0, 1)]
    steel = [tube(0.011, 0.44, 0.6, 0.045), tube(0.004, 0.2, 0.47, 0.066), box(0.036, 0.17, 0.062, 0, -0.075, 0.15, bevel=0.005, tilt=-0.28), trigger(0.045)]
    steel += [box(0.038, 0.004, 0.064, 0, -0.03 - i * 0.03, 0.142 - i * 0.0085, bevel=0.001, tilt=-0.28) for i in range(5)]   # the ribs pressed into the magazine
    hand = box(0.05, 0.058, 0.22, 0, 0.04, 0.33, bevel=0.008)
    cut(hand, [box(0.06, 0.008, 0.026, 0, 0.03 + r * 0.02, 0.25 + c * 0.04, bevel=0) for c in range(5) for r in range(2)])   # its vents
    poly = [done(hand, 0.0005)] + grip(0.3)
    for b in slots:
        bpy.data.objects.remove(b, do_unlink=True)
    return gather('machineGun', {'Metal': metal + rail(0.24, 0.42, 0.072), 'Steel': steel, 'Polymer': poly, 'Brass': [box(0.019, 0.02, 0.066, 0.019, 0.052, 0.09, bevel=0.002)]}, stock(-0.19, -0.35, 0.03, 0.09))


def sniper():
    """An anti-materiel rifle: a long fluted barrel with a slotted brake, a bipod, a box magazine, a bolt, a big scope."""
    rec = box(0.05, 0.078, 0.38, 0, 0.04, 0.06, bevel=0.005)
    cut(rec, [box(0.02, 0.02, 0.09, 0.022, 0.06, 0.05, bevel=0)])
    brake = box(0.06, 0.04, 0.1, 0, 0.05, 1.07, bevel=0.005)
    cut(brake, [box(0.08, 0.022, 0.016, 0, 0.05, 1.04 + i * 0.03, bevel=0) for i in range(3)])
    metal = [done(rec, 0.0006), done(brake, 0.0005), box(0.1, 0.012, 0.02, 0, 0.012, 0.56, bevel=0.003), guard(0.05)]
    metal += [ring(0.019, 0.004, 0.05, z) for z in (0.6, 0.7, 0.8, 0.9)]
    metal += [tube(0.022, -0.02, 0.3, 0.125), tube(0.026, 0.3, 0.38, 0.125, r2=0.034), tube(0.03, -0.08, -0.02, 0.125, r2=0.028), box(0.02, 0.05, 0.03, 0, 0.095, 0.05, bevel=0.004), box(0.02, 0.05, 0.03, 0, 0.095, 0.23, bevel=0.004)]
    metal += [upright(0.012, 0.03, 0, 0.155, 0.14), across(0.012, 0.03, 0.125, 0.14, x=0.03), ring(0.024, 0.003, 0.125, 0.06), ring(0.024, 0.003, 0.125, 0.24)]   # the scope's turrets and rings
    metal += rail(-0.02, 0.3, 0.083) + pins([(0.02, 0.0), (0.02, 0.2), (0.05, -0.08)], w=0.054)
    steel = [tube(0.017, 0.5, 1.02, 0.05, r2=0.014), box(0.04, 0.11, 0.075, 0, -0.06, 0.2, bevel=0.005), box(0.01, 0.014, 0.03, 0.03, 0.06, 0.02, bevel=0.003), trigger(0.045)]
    steel += [tube(0.0045, 0.55, 0.98, 0.05 + 0.0165 * math.sin(a), x=0.0165 * math.cos(a), sides=8) for a in [k * math.pi / 3 for k in range(6)]]                         # the flutes of the barrel
    for sd in (-1, 1):
        leg = upright(0.006, 0.22, sd * 0.045, -0.06, 0.6, lean=0.45, sides=10)
        steel += [leg, orb(0.011, sd * 0.045, -0.155, 0.553, (1, 0.5, 1.4))]
    poly = [box(0.044, 0.05, 0.3, 0, 0.03, 0.38, bevel=0.008), orb(0.013, 0.046, 0.06, 0.02)] + grip(0.25)
    return gather('sniper', {'Metal': metal, 'Steel': steel, 'Polymer': poly, 'Glass': [tube(0.031, 0.378, 0.384, 0.125, sides=24, bevel=0), tube(0.026, -0.084, -0.079, 0.125, sides=24, bevel=0)]}, stock(-0.14, -0.47, 0.02, 0.085, 0.042))


def shotgun():
    """A pump-action shotgun: a fat barrel over a magazine tube, a ribbed wooden pump and stock."""
    rec = box(0.046, 0.072, 0.27, 0, 0.04, 0.06, bevel=0.006)
    cut(rec, [box(0.02, 0.022, 0.075, 0.022, 0.045, 0.08, bevel=0), box(0.03, 0.02, 0.09, 0, 0.0, 0.1, bevel=0)])        # where the empties leave, and where the shells go in
    metal = [done(rec, 0.0006), tube(0.015, 0.19, 0.66, 0.022), box(0.01, 0.05, 0.02, 0, 0.04, 0.64, bevel=0.003), ring(0.0155, 0.003, 0.022, 0.655), guard(0.05)] + pins([(0.03, 0.02), (0.03, 0.14)])
    steel = [tube(0.018, 0.19, 0.78, 0.058), tube(0.0185, 0.775, 0.782, 0.058, r2=0.016), box(0.008, 0.004, 0.56, 0, 0.078, 0.48, bevel=0.001), trigger(0.045)]                # the barrel, and the rib along its top
    pump = tube(0.03, 0.34, 0.52, 0.03, sides=24, bevel=0.004)
    cut(pump, [ring(0.033, 0.0045, 0.03, z) for z in (0.36, 0.39, 0.42, 0.45, 0.48, 0.51)])
    wood = [done(pump, 0), box(0.042, 0.075, 0.1, 0, 0.012, -0.09, bevel=0.012, tilt=0.25), box(0.042, 0.1, 0.24, 0, -0.012, -0.26, bevel=0.014, tilt=0.1)]
    return gather('shotgun', {'Metal': metal, 'Steel': steel, 'Wood': wood, 'Brass': [orb(0.006, 0, 0.083, 0.76)], 'Polymer': [box(0.046, 0.115, 0.02, 0, -0.025, -0.385, bevel=0.006, tilt=0.1)]})


def revolver():
    """The Hand Cannon: a huge revolver. A long heavy barrel with a full lug and a vented rib, a fluted cylinder
    with six chambers, a spur hammer, a wooden grip."""
    frame = box(0.034, 0.05, 0.1, 0, 0.04, 0.02, bevel=0.006)
    cut(frame, [tube(0.032, 0.03, 0.11, 0.045, sides=24, bevel=0)])                                           # the window the cylinder sits in
    metal = [done(frame, 0.0005), box(0.03, 0.012, 0.11, 0, 0.074, 0.03, bevel=0.003), tube(0.016, 0.105, 0.34, 0.052), box(0.014, 0.022, 0.22, 0, 0.03, 0.22, bevel=0.004), guard()]
    rib = box(0.008, 0.01, 0.23, 0, 0.073, 0.22, bevel=0.002)
    cut(rib, [box(0.02, 0.004, 0.022, 0, 0.071, 0.13 + i * 0.035, bevel=0) for i in range(6)])
    metal += [done(rib, 0), tube(0.004, 0.105, 0.2, 0.024)]                                                     # the vented rib, and the ejector rod
    drum = tube(0.03, 0.035, 0.105, 0.045, sides=36, bevel=0.002)
    holes = [tube(0.0075, 0.03, 0.11, 0.045 + 0.018 * math.sin(a), x=0.018 * math.cos(a), sides=14, bevel=0) for a in [k * math.pi / 3 for k in range(6)]]
    flutes = [tube(0.009, 0.06, 0.12, 0.045 + 0.034 * math.sin(a), x=0.034 * math.cos(a), sides=12, bevel=0) for a in [k * math.pi / 3 + math.pi / 6 for k in range(6)]]
    cut(drum, holes + flutes)
    ham = box(0.012, 0.03, 0.016, 0, 0.066, -0.042, bevel=0.004, tilt=-0.6)
    steel = [done(drum, 0.0004), box(0.008, 0.016, 0.014, 0, 0.076, 0.33, bevel=0.002, tilt=-0.3), box(0.018, 0.012, 0.02, 0, 0.082, -0.02, bevel=0.002), ham, trigger(0.04), across(0.006, 0.04, 0.04, 0.02)]
    wood = [box(0.04, 0.12, 0.052, 0, -0.058, -0.016, bevel=0.014, tilt=0.24)]
    brass = [tube(0.0065, 0.031, 0.036, 0.045 + 0.018 * math.sin(a), x=0.018 * math.cos(a), sides=12, bevel=0) for a in [k * math.pi / 3 for k in range(6)]] + [across(0.006, 0.043, -0.05, -0.014)]   # the rounds in it; the grip's medallion
    return gather('revolver', {'Metal': metal, 'Steel': steel, 'Wood': wood, 'Brass': brass})


def cryo():
    """Frostbite: a sprayer. A boxy body, a glowing canister of coolant clamped on top, a feed pipe, a ringed nozzle."""
    body = box(0.05, 0.06, 0.24, 0, 0.04, 0.07, bevel=0.006)
    cut(body, [box(0.06, 0.004, 0.03, 0, 0.03 + i * 0.01, 0.15, bevel=0) for i in range(3)])
    metal = [done(body, 0.0005), tube(0.033, 0.12, 0.14, 0.1, sides=24), tube(0.033, -0.02, 0.0, 0.1, sides=24), guard(0.05)] + [ring(0.02, 0.005, 0.04, z) for z in (0.33, 0.37, 0.41)]
    metal += [box(0.012, 0.03, 0.012, 0, 0.078, 0.13, bevel=0.002), box(0.012, 0.03, 0.012, 0, 0.078, -0.01, bevel=0.002)] + pins([(0.03, 0.0), (0.03, 0.16)], w=0.054)
    metal += [upright(0.008, 0.012, 0.0, 0.136, 0.06), ring(0.031, 0.003, 0.1, 0.03), ring(0.031, 0.003, 0.1, 0.09)]                # the valve on the canister, and its straps
    steel = [tube(0.016, 0.3, 0.42, 0.04), tube(0.019, 0.415, 0.43, 0.04, r2=0.023), tube(0.006, 0.13, 0.28, 0.085), tube(0.006, 0.275, 0.285, 0.065, sides=8), trigger(0.045)]
    poly = [box(0.044, 0.04, 0.12, 0, 0.035, 0.25, bevel=0.008)] + grip(0.25) + [box(0.046, 0.004, 0.1, 0, 0.022 + i * 0.008, 0.25, bevel=0.001) for i in range(4)]
    return gather('cryo', {'Metal': metal, 'Steel': steel, 'Polymer': poly, 'Glass': [tube(0.03, 0.0, 0.12, 0.1, sides=24, bevel=0.003)]})


def saw():
    """The Sawblade Launcher: a wide flat tray with the next blade lying in it (toothed), a drum of spares under it."""
    body = box(0.05, 0.07, 0.3, 0, 0.04, 0.06, bevel=0.006)
    metal = [body, box(0.25, 0.012, 0.016, 0, 0.075, 0.495, bevel=0.003), guard(0.05)] + [box(0.014, 0.034, 0.28, sd * 0.12, 0.062, 0.36, bevel=0.003) for sd in (-1, 1)]
    metal += pins([(0.03, 0.0), (0.03, 0.14)], w=0.054) + [box(0.03, 0.016, 0.06, 0, 0.082, 0.02, bevel=0.003)]
    blade = upright(0.105, 0.006, 0, 0.07, 0.4, sides=48, bevel=0)
    teeth = []
    for k in range(24):
        a = k * math.pi / 12
        t = box(0.02, 0.02, 0.02, 0.105 * math.cos(a), 0.07, 0.4 + 0.105 * math.sin(a), bevel=0)
        m = Matrix.Translation(Vector(B(0.105 * math.cos(a), 0.07, 0.4))) @ Matrix.Rotation(-a + 0.6, 4, 'Z') @ Matrix.Translation(-Vector(B(0.105 * math.cos(a), 0.07, 0.4)))
        t.data.transform(m)
        teeth.append(t)
    cut(blade, teeth + [upright(0.012, 0.02, 0.05 * math.cos(a), 0.07, 0.4 + 0.05 * math.sin(a), sides=12, bevel=0) for a in (0, 2.09, 4.19)])
    drum = across(0.065, 0.075, -0.035, 0.2, sides=36, bevel=0.003)
    steel = [done(blade, 0), drum, trigger(0.045)] + [across(0.066, 0.004, -0.035, 0.2, x=-0.03 + i * 0.012, sides=36, bevel=0) for i in range(6)]      # the edges of the spares in the drum
    brass = [upright(0.024, 0.016, 0, 0.074, 0.4, sides=20), across(0.03, 0.08, -0.035, 0.2, sides=20)]
    tray = box(0.24, 0.022, 0.28, 0, 0.05, 0.36, bevel=0.004)
    poly = [tray] + grip(0.28)
    return gather('saw', {'Metal': metal, 'Steel': steel, 'Brass': brass, 'Polymer': poly}, stock(-0.08, -0.24, 0.03, 0.08))


def flamer():
    """The Flamethrower: a fuel tank with a gauge slung under a long pipe, a perforated heat shield, a flared
    nozzle with a pilot light burning at it."""
    body = box(0.046, 0.06, 0.26, 0, 0.04, 0.05, bevel=0.006)
    metal = [body, tube(0.02, 0.7, 0.78, 0.05, r2=0.03), guard(0.05)] + [ring(0.025, 0.004, 0.05, z) for z in (0.345, 0.595)] + pins([(0.03, 0.0), (0.03, 0.12)], w=0.05)
    metal += [box(0.008, 0.02, 0.03, 0, 0.012, 0.31, bevel=0.002), box(0.008, 0.02, 0.03, 0, 0.012, 0.04, bevel=0.002)]                # the brackets the tank hangs from
    steel = [tube(0.014, 0.18, 0.7, 0.05), tube(0.007, 0.3, 0.36, 0.0), tube(0.005, 0.6, 0.76, 0.078), trigger(0.045)]
    shield = tube(0.024, 0.34, 0.6, 0.05, sides=28, bevel=0)
    cut(shield, [across(0.006, 0.08, 0.05, 0.37 + i * 0.03, bevel=0) for i in range(8)] + [upright(0.006, 0.08, 0, 0.05, 0.385 + i * 0.03, sides=12, bevel=0) for i in range(7)])
    tank = tube(0.045, 0.02, 0.3, -0.035, sides=28, bevel=0)
    brass = [tank, orb(0.045, 0, -0.035, 0.3), orb(0.045, 0, -0.035, 0.02), ring(0.046, 0.003, -0.035, 0.1), ring(0.046, 0.003, -0.035, 0.22), across(0.014, 0.012, -0.035, 0.16, x=0.046)]
    poly = [done(shield, 0)] + grip(0.28)
    return gather('flamer', {'Metal': metal, 'Steel': steel, 'Brass': brass, 'Polymer': poly, 'Light': [orb(0.012, 0, 0.078, 0.77)], 'Glass': [across(0.011, 0.004, -0.035, 0.16, x=0.053, bevel=0)]}, stock(-0.07, -0.225, 0.03, 0.08))


def launcher():
    """The Bone Launcher: a fat tube made of bone, banded with iron and lashed with sinew, a thigh bone lashed along
    the top, a small skull for a rear sight, a jawbone for a foregrip."""
    barrel = tube(0.062, 0.02, 0.56, 0.06, sides=28, bevel=0)
    mouth = tube(0.062, 0.56, 0.66, 0.06, r2=0.085, sides=28, bevel=0)
    cut(mouth, [tube(0.055, 0.5, 0.7, 0.06, r2=0.078, sides=24, bevel=0)])
    bone = [barrel, done(mouth, 0), tube(0.012, -0.02, 0.3, 0.125)] + [orb(0.022, sd * 0.02, 0.125, -0.02) for sd in (-1, 1)] + [orb(0.02, sd * 0.018, 0.125, 0.3) for sd in (-1, 1)]
    bone += [tube(0.006, 0.05, 0.54, 0.06 + 0.062 * math.sin(a), x=0.062 * math.cos(a), sides=8) for a in [k * math.pi / 5 + 0.3 for k in range(10)]]            # ridges down it: it is a bundle of long bones
    skull = orb(0.036, 0, 0.16, 0.1, (1, 1, 1.15))
    cut(skull, [orb(0.011, sd * 0.014, 0.163, 0.132) for sd in (-1, 1)] + [orb(0.006, 0, 0.15, 0.138, (1, 1.6, 1))])
    bone += [done(skull, 0)]
    dark = [tube(0.05, -0.2, 0.02, 0.06, r2=0.062, sides=24), orb(0.052, 0, 0.06, -0.2, (1, 1, 0.7)), box(0.04, 0.02, 0.03, 0, 0.133, 0.115, bevel=0.005), box(0.03, 0.1, 0.04, 0, -0.045, 0.38, bevel=0.008, tilt=-0.2)] + grip(0.2, 0.11, grooves=0)
    dark += [box(0.008, 0.012, 0.006, 0, 0.126 - 0.0 * i, 0.105 + i * 0.006, bevel=0.001) for i in range(4)]                                                         # the little skull's teeth
    dark += [orb(0.01, sd * 0.012, -0.095, 0.37 + j * 0.012) for sd in (-1, 1) for j in range(2)]                                                                  # the jawbone's teeth
    metal = [ring(0.066, 0.009, 0.06, z) for z in (0.08, 0.22, 0.36, 0.5)] + [guard(0.05)] + [orb(0.007, 0.066 * math.cos(a), 0.06 + 0.066 * math.sin(a), z) for z in (0.08, 0.22, 0.36, 0.5) for a in (0.5, 2.6, 4.2)]
    sinew = [ring(0.02, 0.0035, 0.125, z, seg=14) for z in (0.02, 0.06, 0.24, 0.28)] + [ring(0.066, 0.003, 0.06, z) for z in (0.14, 0.15, 0.29, 0.3, 0.43)]
    return gather('launcher', {'Bone': bone, 'BoneDark': dark, 'Metal': metal, 'Wood': sinew, 'Polymer': [tube(0.056, 0.6, 0.63, 0.06, sides=24, bevel=0)]})


def loft(rings, sides=14):
    """A skin over rings: each (x, y, z, radius, squash) in the game's directions, running along z; crinkled a little."""
    import random
    rnd = random.Random(len(rings) * 7 + sides)
    verts, faces = [], []
    for k, (x, y, z, r, sq) in enumerate(rings):
        for i in range(sides):
            a = i * 2 * math.pi / sides
            rr = r * (1 + 0.09 * (rnd.random() - 0.5))                                # (rolled by hand: it is not a tube off a machine)
            verts.append(B(x + math.cos(a) * rr, y + math.sin(a) * rr * sq, z + 0.0012 * (rnd.random() - 0.5)))
    for k in range(len(rings) - 1):
        for i in range(sides):
            a, b = k * sides + i, k * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(range(sides - 1, -1, -1)))
    faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
    mesh = bpy.data.meshes.new('loft')
    mesh.from_pydata(verts, [], faces)
    o = bpy.data.objects.new('loft', mesh)
    bpy.context.scene.collection.objects.link(o)
    only(o)
    bpy.ops.object.shade_smooth()
    return o


def boof():
    """What he smokes: a joint, rolled by hand. A cone: thin at the mouth, where a rolled card tip is, fattening to
    the end that burns; the paper a little crumpled, with the line of its gummed edge down it. Along z from his lips
    (0) to its end (0.128); the game puts its ember there. Also `boofbroken`: the same, snapped in the middle, the far
    half turned up from the break (his last one). The game puts that one's ember on the end of the far half: if the
    hinge or the angle below change, so must SNAPPED_END in src/player/skaterModel.js."""
    R = lambda z: 0.0085 + 0.0062 * min(1.0, max(0.0, (z - 0.03) / 0.09))            # how thick it is along its length
    made = []
    made.append(join('boof_Crutch', [loft([(0, 0, z, 0.0086, 1.0) for z in (0.0, 0.008, 0.016, 0.024, 0.031)], 14)]))
    paper = loft([(0.0006 * math.sin(z * 90), 0.0005 * math.sin(z * 60 + 1), z, R(z), 0.93) for z in [0.029 + i * 0.0085 for i in range(11)]], 14)
    seam = loft([(R(z) * 0.98, 0, z, 0.0009, 1.0) for z in [0.03 + i * 0.017 for i in range(6)]], 5)   # the gummed edge
    made.append(join('boof_Paper', [paper, seam]))
    made.append(join('boof_Ash', [loft([(0, 0, z, r, 0.95) for z, r in ((0.114, 0.0149), (0.119, 0.0151), (0.124, 0.014), (0.128, 0.0115))], 14)]))
    # snapped: the near half still in his mouth, the far half hanging by a shred of paper
    near = loft([(0, 0, z, R(z), 0.93) for z in (0.029, 0.04, 0.052, 0.064, 0.074)], 14)
    far = loft([(0, 0, z, R(z), 0.93) for z in (0.074, 0.086, 0.098, 0.11, 0.122)], 14)
    hinge = Vector(B(0, -R(0.074), 0.074))
    far.data.transform(Matrix.Translation(hinge) @ Matrix.Rotation(-0.8, 4, 'X') @ Matrix.Translation(-hinge))
    made.append(join('boofbroken_Paper', [near, far]))
    made.append(join('boofbroken_Crutch', [loft([(0, 0, z, 0.0086, 1.0) for z in (0.0, 0.008, 0.016, 0.024, 0.031)], 14)]))
    return made


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name, colour in (('Metal', (0.08, 0.085, 0.095, 1)), ('Steel', (0.5, 0.52, 0.55, 1)), ('Polymer', (0.02, 0.02, 0.022, 1)), ('Paper', (0.9, 0.88, 0.8, 1)), ('Crutch', (0.75, 0.6, 0.4, 1)), ('Ash', (0.3, 0.3, 0.3, 1)), ('Wood', (0.37, 0.23, 0.11, 1)), ('Bone', (0.85, 0.82, 0.74, 1)), ('BoneDark', (0.6, 0.57, 0.5, 1)), ('Brass', (0.78, 0.6, 0.23, 1)), ('Glass', (0.5, 0.83, 1, 1)), ('Light', (1, 0.6, 0.25, 1))):
        m = bpy.data.materials.new(name)
        m.diffuse_color = colour
    made = pistol() + boof()
    for build in (machine_gun, sniper, shotgun, revolver, cryo, saw, flamer, launcher):
        try:
            made += build()
        except Exception:
            print('GUN FAILED', build.__name__)
            traceback.print_exc()
    for o in made:
        print('MESH', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), 'tris', [round(d, 3) for d in o.dimensions])
    if PREVIEW:
        scene = bpy.context.scene
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        scene.collection.objects.link(cam)
        scene.camera = cam
        cam.data.lens = 90
        for i, eye in enumerate([(-1.6, -0.45, 0.35)]):
            look = (0, -0.3, 0.02)
            cam.location = eye
            cam.rotation_euler = (Vector(look) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
            scene.render.resolution_x, scene.render.resolution_y = 900, 700
            shown = sorted({o.name.split('_')[0] for o in made})
            for k, o in enumerate(made):
                o.location = (shown.index(o.name.split('_')[0]) % 3 * 0.0, 0, -(shown.index(o.name.split('_')[0])) * 0.0)
            scene.render.filepath = PREVIEW.replace('.png', f'_{i}.png')
            scene.render.engine = 'BLENDER_WORKBENCH'
            scene.display.shading.light = 'STUDIO'
            scene.display.shading.color_type = 'MATERIAL'
            scene.display.shading.show_cavity = True
            bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects:
        o.select_set(o in made)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=False, export_yup=True, export_materials='PLACEHOLDER', export_texcoords=False)
    print('EXPORTED', OUT, os.path.getsize(OUT))


try:
    main()
except Exception:
    traceback.print_exc()
