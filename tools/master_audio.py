# Cut, trim, fade and level his Suno tracks (decoded to WAV in dl/Audio/wav) into the game's music, as WAVs in
# dl/Audio/out, ready for tools/extract_audio.py to encode to OGG.
#   python tools/master_audio.py
# Levels: loops by loudness (so that a crossfade from one to the next keeps the room's level), everything else by peak.
import os, wave, numpy as np
SRC = 'dl/Audio/wav'; OUT = 'dl/Audio/out'
os.makedirs(OUT, exist_ok=True)
def read(name):
    w = wave.open(os.path.join(SRC, name), 'rb'); sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32).reshape(-1, 2) / 32768.0
    return x, sr
def write(name, x, sr):
    y = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    w = wave.open(os.path.join(OUT, name), 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(y.tobytes()); w.close()
def fades(x, sr, fin, fout):
    n = len(x); a = int(fin * sr); b = int(fout * sr)
    if a: x[:a] *= np.linspace(0, 1, a)[:, None]
    if b: x[n - b:] *= np.linspace(1, 0, b)[:, None] ** 1.5
    return x
def level(x, peak_db=None, rms_db=None):
    if rms_db is not None:
        r = np.sqrt((x ** 2).mean()); x = x * (10 ** (rms_db / 20) / (r + 1e-12))
    pk = np.abs(x).max()
    lim = 10 ** ((peak_db if peak_db is not None else -1.0) / 20)
    if peak_db is not None and rms_db is None: x = x * (lim / (pk + 1e-12))
    elif pk > lim: x = x * (lim / pk)   # (a loop pushed up to its loudness never clips: brought back under the ceiling)
    return x
JOBS = [
    # (source, start, end, fade in, fade out, level, out name)
    ('Moon-the-way-down.wav', 0.0, 17.15, 0.0, 1.2, dict(peak_db=-1), 'cue_moon_down.wav'),
    ('BAck-to-the-moon.wav', 0.0, 15.0, 0.0, 1.0, dict(peak_db=-1), 'cue_moon_up.wav'),
    ('The-station-the-way-in.wav', 4.84, 50.0, 0.0, 3.0, dict(peak_db=-1), 'cue_way_in.wav'),   # (its first hit, 11.64 s in, on the cage's impact: 6.8 s into the scene)
    ('The-way-out.wav', 0.0, 27.0, 0.0, 1.5, dict(peak_db=-1), 'cue_way_out.wav'),
    ('DREAD.wav', 10.5, 164.0, 0.05, 0.05, dict(rms_db=-24), 'dread.wav'),
    ('Hunt.wav', 3.0, 188.8, 0.05, 0.05, dict(rms_db=-21), 'hunt.wav'),
    ('swarm.wav', 5.5, 183.8, 0.05, 0.05, dict(rms_db=-19), 'swarm.wav'),
    ('The-lounge.wav', 0.9, 180.5, 0.05, 0.05, dict(rms_db=-22), 'lounge.wav'),
    ('Objective-jingles.wav', 0.78, 6.6, 0.02, 0.6, dict(peak_db=-3), 'jingle_1.wav'),
    ('Objective-jingles.wav', 6.6, 11.6, 0.05, 0.6, dict(peak_db=-3), 'jingle_2.wav'),
    ('Objective-jingles.wav', 11.9, 14.6, 0.05, 1.0, dict(peak_db=-3), 'jingle_3.wav'),
]
STINGS = [(0.50, 2.60), (4.95, 6.20), (6.20, 9.25), (9.25, 10.35), (11.10, 12.45), (12.45, 14.35), (15.00, 17.45), (17.45, 20.50), (33.00, 35.85), (36.90, 39.80)]
LAUGHS = [(44.20, 46.35), (47.80, 50.55), (50.55, 51.90), (54.15, 58.50)]
for i, (a, b) in enumerate(STINGS): JOBS.append(('stingers-and-laughs.wav', a, b, 0.01, 0.25, dict(peak_db=-2), f'sting_{i + 1}.wav'))
for i, (a, b) in enumerate(LAUGHS): JOBS.append(('stingers-and-laughs.wav', a, b, 0.02, 0.3, dict(peak_db=-3), f'laugh_{i + 1}.wav'))
cache = {}
for src, a, b, fin, fout, lv, out in JOBS:
    if src not in cache: cache[src] = read(src)
    x, sr = cache[src]
    y = x[int(a * sr):int(b * sr)].copy()
    y = fades(y, sr, fin, fout)
    y = level(y, **lv)
    write(out, y, sr)
    r = 20 * np.log10(np.sqrt((y ** 2).mean()) + 1e-12); p = 20 * np.log10(np.abs(y).max() + 1e-12)
    print(f'{out:22s} {len(y) / sr:7.2f} s  rms {r:6.1f}  peak {p:5.1f}')
