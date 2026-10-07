#!/usr/bin/env python3
"""
Builds the audio for video/P08-video.mp4:
  video/audio/voiceover.wav  - Kokoro-82M neural TTS (Apache-2.0), one line per scene, placed on the timeline
  video/audio/music.wav      - original ambient bed synthesised here with numpy (no samples, no third-party music)

  KOKORO_DIR=/path/with/kokoro-q8.onnx+voices.npz+tts venv  python3 scripts/build-audio.py
Requires: numpy, soundfile, kokoro-onnx (only for the voice-over step).
"""
import json, os, sys
import numpy as np
import soundfile as sf

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "video", "audio")
SR = 48000
LENGTH = 60.0
os.makedirs(OUT, exist_ok=True)

# (start, end, text) — windows match the scenes in scripts/build-video.js
SCRIPT = [
    (0.4, 4.9, "The AI project manager. Trello, n-eight-n, Gemini and Telegram."),
    (5.4, 14.6, "Trello is the source of truth. Each card holds the owner, deadline, hours, blockers and dependencies, and n-eight-n reads all of it."),
    (15.4, 29.4, "Here the workflow is running in n-eight-n. It loads the lists, custom fields and cards from Trello, then hands them to the rule engine. Each step turns green as it finishes."),
    (30.4, 41.6, "The rules decide each project's health: overdue, blocked, at risk, or on track. Every result comes with a reason, and the AI never sets a status."),
    (42.3, 51.7, "Gemini then writes a short report for the founder. It is checked against the rules, and if it fails that check, the rule-based report is sent instead."),
    (52.3, 59.4, "The founder gets one clear message on Telegram, every weekday morning."),
]


def voiceover():
    from kokoro_onnx import Kokoro
    kdir = os.environ["KOKORO_DIR"]
    k = Kokoro(os.path.join(kdir, "kokoro-q8.onnx"), os.path.join(kdir, "voices.npz"))
    track = np.zeros(int(LENGTH * SR), dtype=np.float32)
    timing = []
    for start, end, text in SCRIPT:
        window = end - start
        speed = 1.0
        for _ in range(4):
            samples, sr = k.create(text, voice="af_heart", speed=speed, lang="en-us")
            dur = len(samples) / sr
            if dur <= window or speed >= 1.25:
                break
            speed = min(1.25, speed * dur / window * 1.02)
        # resample 24k -> 48k (linear is fine for speech at this ratio), trim trailing silence
        x = np.interp(np.arange(0, len(samples), sr / SR), np.arange(len(samples)), samples).astype(np.float32)
        nz = np.where(np.abs(x) > 0.003)[0]
        x = x[: nz[-1] + int(0.05 * SR)] if len(nz) else x
        x = x / (np.abs(x).max() + 1e-9) * 0.89
        i = int(start * SR)
        n = min(len(x), len(track) - i)
        track[i : i + n] += x[:n]
        timing.append({"start": start, "end": round(start + len(x) / SR, 2), "window_end": end, "speed": round(speed, 3), "text": text})
        print(f"{start:5.1f}s  {len(x)/SR:5.2f}s / {window:4.1f}s  speed={speed:.2f}  {text[:60]}")
        if len(x) / SR > window + 0.3:
            sys.exit(f"line overruns its scene window: {text}")
    sf.write(os.path.join(OUT, "voiceover.wav"), track, SR, subtype="PCM_16")
    json.dump(timing, open(os.path.join(OUT, "voiceover-timing.json"), "w"), indent=1)


def music():
    rng = np.random.default_rng(8)
    t_total = int(LENGTH * SR)
    L = np.zeros(t_total)
    R = np.zeros(t_total)
    bpm = 84
    beat = 60 / bpm
    bar = 4 * beat
    midi = lambda m: 440 * 2 ** ((m - 69) / 12)
    # Am9 - Fmaj7 - Cmaj7 - G6, two bars each
    chords = [[45, 57, 60, 64, 67, 71], [41, 53, 57, 60, 64, 69], [48, 55, 59, 60, 64, 67], [43, 55, 59, 62, 64, 67]]
    seg = 2 * bar
    t = np.arange(t_total) / SR

    def env(n, a, r):
        e = np.ones(n)
        na, nr = int(a * SR), int(r * SR)
        e[:na] = np.linspace(0, 1, na) ** 2
        e[-nr:] *= np.linspace(1, 0, nr) ** 2
        return e

    k = 0
    pos = 0.0
    while pos < LENGTH:
        ch = chords[k % 4]
        s0 = int(pos * SR)
        n = min(int((seg + 1.6) * SR), t_total - s0)
        tt = np.arange(n) / SR
        e = env(n, 1.4, 1.6)
        for j, m in enumerate(ch):
            f = midi(m)
            amp = (0.05 if j == 0 else 0.032) * (0.8 if m > 66 else 1)
            for side, det in ((L, -4), (R, 4)):
                fd = f * 2 ** (det / 1200)
                tone = sum(np.sin(2 * np.pi * fd * h * tt + h) / (h ** 1.6) for h in range(1, 6))
                side[s0 : s0 + n] += amp * tone * e
        # soft plucked arpeggio, eighth notes, upper octave
        arp = [ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[3] + 12]
        for i in range(int(seg / (beat / 2))):
            st = s0 + int(i * beat / 2 * SR)
            if st >= t_total:
                break
            nn = min(int(0.9 * SR), t_total - st)
            tt2 = np.arange(nn) / SR
            f = midi(arp[i % 4])
            pl = np.sin(2 * np.pi * f * tt2) * np.exp(-tt2 * 5.5) * 0.022
            pan = 0.35 + 0.3 * (i % 2)
            L[st : st + nn] += pl * (1 - pan)
            R[st : st + nn] += pl * pan
        pos += seg
        k += 1

    # gentle one-pole low-pass for warmth
    def lowpass(x, fc):
        a = np.exp(-2 * np.pi * fc / SR)
        y = np.empty_like(x)
        acc = 0.0
        for i in range(0, len(x), 4096):
            blk = x[i : i + 4096]
            out = np.empty_like(blk)
            for j, v in enumerate(blk):
                acc = (1 - a) * v + a * acc
                out[j] = acc
            y[i : i + 4096] = out
        return y

    # cheap reverb: convolve with decaying noise impulse response
    ir_n = int(2.2 * SR)
    ir = rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / SR * 2.6)
    ir[0] = 0
    ir /= np.abs(ir).sum() / 6

    def conv(x):
        n = len(x) + len(ir)
        return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[: len(x)]

    out = []
    for x in (L, R):
        x = lowpass(x, 3200)
        x = 0.75 * x + 0.35 * conv(x)
        out.append(x)
    y = np.stack(out, 1)
    fade = np.ones(t_total)
    fade[: int(1.5 * SR)] = np.linspace(0, 1, int(1.5 * SR))
    fade[-int(3 * SR) :] = np.linspace(1, 0, int(3 * SR))
    y *= fade[:, None]
    y /= np.abs(y).max() + 1e-9
    y *= 0.5
    sf.write(os.path.join(OUT, "music.wav"), y.astype(np.float32), SR, subtype="PCM_16")
    print("music.wav", LENGTH, "s")


if __name__ == "__main__":
    what = sys.argv[1:] or ["voice", "music"]
    if "music" in what:
        music()
    if "voice" in what:
        voiceover()
