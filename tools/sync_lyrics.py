"""Time the open mic's lyric cards to the song itself (lounge.js SHOW_LYRICS).

    python tools/sync_lyrics.py public/sounds/deadair/show_song.ogg [--model small] [--write]

faster-whisper transcribes the song with word timestamps; each card's words are then matched, in order, against the
transcript (fuzzy: the growled lines come out mangled), and the card is moved to the first matched word's time. Prints the
old and new times; --write puts the new times into src/deadair/lounge.js. Lines that match nothing keep their time.
"""
import difflib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOUNGE = os.path.join(HERE, '..', 'src', 'deadair', 'lounge.js')


def words_of(text):
    return [w for w in re.sub(r"[^a-z0-9' ]+", ' ', text.lower()).split() if w]


def decode(path, rate=16000):
    # (PyAV, by hand: faster-whisper's own decoder asks this PyAV for an argument it does not have)
    import av, numpy as np
    out = []
    with av.open(path) as container:
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format='s16', layout='mono', rate=rate)
        for frame in container.decode(stream):
            for f in resampler.resample(frame):
                out.append(f.to_ndarray().reshape(-1))
        for f in resampler.resample(None) or []:
            out.append(f.to_ndarray().reshape(-1))
    return (np.concatenate(out).astype(np.float32) / 32768.0) if out else np.zeros(0, np.float32)


def transcribe(path, model_name):
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device='cpu', compute_type='int8')
    audio = decode(path)
    segments, info = model.transcribe(audio, word_timestamps=True, language='en', beam_size=5, vad_filter=False,
                                      initial_prompt='Hold up. Let me hit that boof. Mastre rolled in off the Moon, a skater with a gun. BOOF! He hit that boof! GOY! GOY! GOY! BRAINS!')
    out = []
    for seg in segments:
        for w in seg.words or []:
            out.append((w.start, w.end, w.word.strip()))
    return out, info


def read_cards():
    s = open(LOUNGE, encoding='utf-8').read()
    m = re.search(r'const SHOW_LYRICS = \[(.*?)\n\];', s, re.S)
    if not m:
        raise SystemExit('no SHOW_LYRICS in lounge.js')
    body = m.group(1)
    cards = []
    for t, q, text in re.findall(r"\[(\d+(?:\.\d+)?), (['\"])(.*?)\2\]", body):
        cards.append([float(t), text])
    return s, m, cards


def align(cards, words):
    # (each card in turn: the best run of its words in the transcript, searched from where the last card landed)
    wtext = [words_of(w[2]) for w in words]
    flat = [(i, t) for i, ws in enumerate(wtext) for t in ws]
    tokens = [t for _, t in flat]
    pos = 0
    out = []
    for t_old, text in cards:
        cw = words_of(text)
        if not cw:
            out.append((t_old, None, 0.0)); continue
        best, best_at = 0.0, None
        n = len(cw)
        for start in range(pos, max(pos, len(tokens) - 1)):
            window = tokens[start:start + n + 2]
            if not window:
                break
            r = difflib.SequenceMatcher(None, cw, window).ratio()
            # (the first word has to be near: a card is its opening)
            if r > best and difflib.SequenceMatcher(None, cw[0], window[0]).ratio() > 0.6:
                best, best_at = r, start
        if best_at is not None and best >= 0.45:
            wi = flat[best_at][0]
            out.append((t_old, words[wi][0], best))
            pos = best_at + max(1, n - 1)
        else:
            out.append((t_old, None, best))
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    model = 'small'
    for a in sys.argv[1:]:
        if a.startswith('--model='): model = a.split('=', 1)[1]
    write = '--write' in sys.argv
    path = args[0] if args else os.path.join(HERE, '..', 'public', 'sounds', 'deadair', 'show_song.ogg')
    words, info = transcribe(path, model)
    print(f'# {len(words)} words, {info.duration:.1f} s, model {model}')
    for s, e, w in words:
        print(f'{s:6.2f} {w}')
    src, m, cards = read_cards()
    res = align(cards, words)
    print('# card times: old -> new (match)')
    new_times = []
    for (t_old, text), (_, t_new, score) in zip(cards, res):
        shown = f'{t_new:6.2f}' if t_new is not None else '  keep'
        print(f'{t_old:6.2f} -> {shown}  ({score:.2f})  {text}')
        new_times.append(t_new if t_new is not None else t_old)
    if write:
        body = m.group(1)
        i = 0
        def sub(mm):
            nonlocal i
            t = new_times[i]; i += 1
            return f'[{t:.1f}, {mm.group(2)}{mm.group(3)}{mm.group(2)}]'
        body2 = re.sub(r"\[(\d+(?:\.\d+)?), (['\"])(.*?)\2\]", sub, body)
        src2 = src[:m.start(1)] + body2 + src[m.end(1):]
        open(LOUNGE, 'w', encoding='utf-8').write(src2)
        print(f'# wrote {LOUNGE}')


if __name__ == '__main__':
    main()
