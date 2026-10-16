# Shrinks textures for the web: each <in>=<out> is loaded, scaled down to <size> square (if bigger) and saved as JPEG.
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --python tools/shrink_textures.py -- <size> <in>=<out> ...
import os, sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:]
size = int(args[0])
for pair in args[1:]:
    src, out = (os.path.abspath(p) for p in pair.split('=', 1))
    img = bpy.data.images.load(src)
    if 'nor' in os.path.basename(src) or 'rough' in os.path.basename(src): img.colorspace_settings.name = 'Non-Color'
    if img.size[0] > size: img.scale(size, size)
    img.file_format = 'JPEG'
    img.save(filepath=out, quality=85)
    print(os.path.basename(out), os.path.getsize(out) // 1024, 'KB')
