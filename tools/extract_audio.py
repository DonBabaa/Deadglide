# Pull the sound out of audio or video files (Suno's mp4 / webm, or any wav), as WAV or OGG, with Blender's own FFmpeg.
# (There is no ffmpeg on this machine; Blender has it built in.)
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --python tools/extract_audio.py -- \
#       <out_dir> <wav|ogg> [bitrate_kbps] <file> [<file> ...]
#
# Each file comes out as <out_dir>/<its name>.<wav|ogg>, 44.1 kHz stereo. A line per file: name, seconds.
import sys, os
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
out_dir, kind = os.path.abspath(args[0]), args[1]
rest = args[2:]
bitrate = 160
if rest and rest[0].isdigit():
    bitrate = int(rest[0]); rest = rest[1:]
os.makedirs(out_dir, exist_ok=True)

scene = bpy.context.scene
scene.render.fps = 100            # (a frame a hundredth of a second: the end is cut to within that)
scene.render.fps_base = 1.0
editor = scene.sequence_editor_create()
strips = editor.strips if hasattr(editor, 'strips') else editor.sequences

for path in rest:
    for s in list(strips):
        strips.remove(s)
    name = os.path.splitext(os.path.basename(path))[0]
    snd = strips.new_sound(name, os.path.abspath(path), 1, 1)
    scene.frame_start = 1
    scene.frame_end = max(2, int(snd.frame_final_end) - 1)
    seconds = (scene.frame_end - scene.frame_start + 1) / scene.render.fps
    out = os.path.join(out_dir, name + ('.wav' if kind == 'wav' else '.ogg'))
    if kind == 'wav':
        r = bpy.ops.sound.mixdown(filepath=out, check_existing=False, relative_path=False, container='WAV', codec='PCM', format='S16', mixrate=44100, channels='STEREO')
    else:
        r = bpy.ops.sound.mixdown(filepath=out, check_existing=False, relative_path=False, container='OGG', codec='VORBIS', bitrate=bitrate, mixrate=44100, channels='STEREO')
    print(f'EXTRACTED\t{name}\t{seconds:.2f}\t{out}')
