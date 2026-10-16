# His Suno tracks for the title and the levels (decoded to WAV in dl/Audio/wav), made into loops, as WAVs in dl/Audio/out
# for the browser to encode (AAC): each is cut at its loop's end, and keeps its intro: it plays from the top once and
# then round and round between its loop's start and end (fx/music.js: the buffer's own loopStart / loopEnd).
#   python tools/master_loops.py
# The loop points were found by matching the sound after the end to the sound after the start, by rhythm (the onset
# envelope over 8 s) and tone (a 40-band spectrum over 4 s), over every length from 30 s up to the fade, with the
# join's phase then found to the sample. The last moments before the end are crossfaded into what comes before the
# start, so that the jump back is not heard. Every loop is brought to the same loudness (over its loop), under a
# ceiling: one level's music to the next, and the boss's cutting in, are the same level.
import os, wave, json, numpy as np
SRC = 'dl/Audio/wav'; OUT = 'dl/Audio/out'
os.makedirs(OUT, exist_ok=True)
LOOPS = [
    # (source, loop start s, loop end s, out name)
    ('title-screen', 22.1700, 120.3537, 'title_theme'),
    ('cemetary', 5.3700, 130.5172, 'level_cemetery'),
    ('catacombs', 16.0500, 187.5402, 'level_catacombs'),
    ('free-ride', 20.9800, 206.0869, 'level_freeride'),
    ('The-house', 11.4200, 76.2613, 'level_house'),
    ('Long-way-down', 35.3600, 190.9751, 'level_longway'),
    ('boss-fights', 6.2900, 136.6398, 'level_boss'),
]
RMS_DB, CEILING_DB, XF = -17.0, -1.0, 0.12
table = {}
for src, a, b, name in LOOPS:
    w = wave.open(os.path.join(SRC, src + '.wav'), 'rb'); sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32).reshape(-1, 2) / 32768.0
    s, e, n = int(round(a * sr)), int(round(b * sr)), int(XF * sr)
    y = x[:e].copy()
    t = np.linspace(0, 1, n)[:, None]
    y[e - n:e] = y[e - n:e] * np.cos(t * np.pi / 2) + x[s - n:s] * np.sin(t * np.pi / 2)   # (into what comes before the start)
    r = np.sqrt((y[s:e] ** 2).mean()); y *= 10 ** (RMS_DB / 20) / (r + 1e-12)
    pk = np.abs(y).max(), 10 ** (CEILING_DB / 20)
    if pk[0] > pk[1]:   # (over the ceiling: the peaks, and only the peaks, rounded off)
        lim = pk[1]; k = np.abs(y) > lim * 0.8
        y[k] = np.sign(y[k]) * (lim * 0.8 + (lim * 0.2) * np.tanh((np.abs(y[k]) - lim * 0.8) / (lim * 0.2)))
    z = (np.clip(y, -1, 1) * 32767).astype(np.int16)
    o = wave.open(os.path.join(OUT, name + '.wav'), 'wb'); o.setnchannels(2); o.setsampwidth(2); o.setframerate(sr); o.writeframes(z.tobytes()); o.close()
    table[name] = [round(a, 4), round(e / sr, 4)]
    print(f'{name}: {e / sr:.1f} s, loop {a:.2f}-{e / sr:.2f}, peak {20 * np.log10(np.abs(y).max() + 1e-9):.1f} dB')
print(json.dumps(table))
