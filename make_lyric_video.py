#!/usr/bin/env python3
"""
Lyric video generator - single word pop-up style.
  - Verse:   electric yellow, bold, large
  - Chorus:  hot pink, bold, larger + bright orange outline
Chorus detected by timestamp ranges from the transcript.
"""

import json
import subprocess

# Chorus time ranges (seconds) identified from transcript
CHORUS_RANGES = [
    (38.9, 53.9),   # "Tyst är det nyttigt... lycklig / Rösten om dina val..."
    (102.4, 118.9), # Same lines repeated
]

def is_chorus(t: float) -> bool:
    return any(start <= t <= end for start, end in CHORUS_RANGES)


def seconds_to_ass(s: float) -> str:
    h  = int(s // 3600)
    m  = int((s % 3600) // 60)
    sc = int(s % 60)
    cs = int(round((s % 1) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{sc:02d}.{cs:02d}"


def build_ass(json_path: str, ass_path: str, w: int = 1024, h: int = 1024):
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    # ASS colors are stored as &HAABBGGRR (alpha, blue, green, red)
    # Verse: electric yellow  RGB(255,240,0)  → BGR 00 F0 FF → &H0000F0FF
    # Chorus main: hot pink   RGB(255, 20,147)→ BGR 93 14 FF → &H0093 14FF
    # Chorus outline: bright orange RGB(255,140,0) → BGR 00 8C FF → &H00008CFF

    header = f"""\
[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Verse,Arial,82,&H0000F0FF,&H0000F0FF,&H00000000,&HA0000000,-1,0,0,0,100,100,2,0,1,5,3,2,40,40,90,1
Style: Chorus,Arial,100,&H001493FF,&H001493FF,&H00008CFF,&HA0000000,-1,0,0,0,100,100,2,0,1,5,4,2,40,40,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    # Verse  primary: &H0000F0FF  = yellow  (B=00, G=F0, R=FF)
    # Chorus primary: &H001493FF  = hot pink (B=14, G=93, R=FF)
    # Chorus outline: &H00008CFF  = bright orange (B=00, G=8C, R=FF)

    lines = []
    for seg in data["segments"]:
        words = seg.get("words", [])
        if not words:
            continue

        for i, word in enumerate(words):
            t_start = word["start"]
            t_end   = words[i + 1]["start"] if i + 1 < len(words) else word["end"]

            if t_end - t_start < 0.05:
                t_end = t_start + 0.05

            text  = word["word"].strip()
            if not text:
                continue

            style = "Chorus" if is_chorus(t_start) else "Verse"

            lines.append(
                f"Dialogue: 0,{seconds_to_ass(t_start)},{seconds_to_ass(t_end)},"
                f"{style},,0,0,0,,{text}"
            )

    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(header)
        f.write("\n".join(lines) + "\n")

    chorus_count = sum(1 for l in lines if ",Chorus," in l)
    print(f"Wrote {len(lines)} events ({chorus_count} chorus, {len(lines)-chorus_count} verse) → {ass_path}")


def render_video(image: str, audio: str, ass: str, output: str):
    ass_escaped = ass.replace("\\", "\\\\").replace(":", "\\:")
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-framerate", "24", "-i", image,
        "-i", audio,
        "-vf", f"ass={ass_escaped}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        output,
    ]
    subprocess.run(cmd, check=True)
    print(f"Video ready → {output}")


if __name__ == "__main__":
    base   = "/home/dellvall/lyrics"
    build_ass(f"{base}/Lycklig.json", f"{base}/Lycklig.ass")
    render_video(
        image  = f"{base}/Gadw90kc.jpg",
        audio  = f"{base}/Lycklig.mp3",
        ass    = f"{base}/Lycklig.ass",
        output = f"{base}/Lycklig_lyrics.mp4",
    )
