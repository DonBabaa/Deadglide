# DEAD AIR's recorded sounds: the zombies' voices and the station's stings, out of the 24-bit stereo WAVs they came
# as (CC0: see public/sounds/deadair/CREDITS.txt) into small mono 16-bit WAVs the game fetches when the mode opens.
# Each is trimmed of the silence round it, brought up to the same peak, resampled (through its spectrum, so nothing
# folds back down as noise), and given a few milliseconds' fade at each end so it never clicks.
#
#   python -I tools/build_deadair_audio.py <out folder> <rate> <name>=<wav>[@<from>-<to>] ...
#
# @from-to (seconds) cuts out just that stretch of the recording first (one reload, cut into its magazine out, its
# magazine in and its slide).
import os, struct, sys, wave

import numpy as np

out, rate = os.path.abspath(sys.argv[1]), int(sys.argv[2])
os.makedirs(out, exist_ok=True)


def read(path):
    with wave.open(path) as w:
        channels, width, frames, source = w.getnchannels(), w.getsampwidth(), w.getnframes(), w.getframerate()
        raw = np.frombuffer(w.readframes(frames), dtype=np.uint8)
    if width == 3:   # (24-bit: three bytes a sample, little-endian, signed)
        b = raw.reshape(-1, 3).astype(np.int32)
        x = (b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16))
        x = np.where(x >= 1 << 23, x - (1 << 24), x) / float(1 << 23)
    elif width == 2: x = raw.view(np.int16) / 32768.0
    else: x = (raw.astype(np.float64) - 128) / 128.0
    return x.reshape(-1, channels).mean(axis=1), source


for pair in sys.argv[3:]:
    name, src = pair.split('=', 1)
    cut = None
    if '@' in src: src, span = src.rsplit('@', 1); cut = [float(t) for t in span.split('-')]
    x, source = read(src)
    if cut: x = x[int(cut[0] * source):int(cut[1] * source)]
    loud = np.nonzero(np.abs(x) > 0.004)[0]
    if len(loud): x = x[max(0, loud[0] - int(0.01 * source)):loud[-1] + int(0.05 * source)]
    n = int(round(len(x) * rate / source))
    spectrum = np.fft.rfft(x)
    keep = n // 2 + 1
    spectrum = spectrum[:keep] if keep <= len(spectrum) else np.concatenate([spectrum, np.zeros(keep - len(spectrum))])
    y = np.fft.irfft(spectrum, n) * (n / len(x))
    y *= 0.89 / max(1e-6, np.abs(y).max())   # (to about -1 dB)
    fade = min(len(y) // 4, int(0.006 * rate))
    y[:fade] *= np.linspace(0, 1, fade); y[-fade:] *= np.linspace(1, 0, fade)
    with wave.open(os.path.join(out, f'{name}.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
    print(f'{name}.wav  {len(y) / rate:.2f} s  {os.path.getsize(os.path.join(out, name + ".wav")) / 1024:.0f} KB')
