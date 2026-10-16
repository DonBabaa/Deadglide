# Frames to a film: a folder of numbered pictures (f0000.jpg, f0001.jpg ...) to an MP4 (H.264), by Blender's own FFmpeg.
# Used for the Crew Lounge's open-mic film (public/video/deadair_openmic.mp4: the frames are recorded from the game itself,
# a frame at a time at 30 a second; see GAME_SPEC.md, "The open mic").
#
#   blender --background --python tools/encode_frames.py -- <frames dir> <out.mp4> [fps=30]
import bpy, sys, os

a = sys.argv[sys.argv.index('--') + 1:]
DIR, OUT = os.path.abspath(a[0]), os.path.abspath(a[1])
FPS = int(a[2]) if len(a) > 2 else 30
files = sorted(f for f in os.listdir(DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png')))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
ed = scene.sequence_editor_create()
coll = ed.strips if hasattr(ed, 'strips') else ed.sequences   # (Blender 4.4 renamed them)
strip = coll.new_image(name='frames', filepath=os.path.join(DIR, files[0]), channel=1, frame_start=1)
for f in files[1:]:
    strip.elements.append(f)
first = bpy.data.images.load(os.path.join(DIR, files[0]))
W, H = first.size
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = W, H, 100
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, len(files)
scene.view_settings.view_transform = 'Standard'   # (the pictures are already what they should look like)
scene.view_settings.look = 'None'
if hasattr(scene.render.image_settings, 'media_type'):
    scene.render.image_settings.media_type = 'VIDEO'   # (Blender 5: a film is a kind of its own, not a file format of a picture)
scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.ffmpeg.constant_rate_factor = 'HIGH'
scene.render.ffmpeg.ffmpeg_preset = 'GOOD'
scene.render.ffmpeg.gopsize = FPS
scene.render.ffmpeg.audio_codec = 'NONE'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
scene.render.filepath = OUT
bpy.ops.render.render(animation=True)
print('ENCODED', OUT, len(files), 'frames', W, 'x', H, os.path.getsize(OUT) if os.path.exists(OUT) else 'missing')
