#!/usr/bin/env python3
"""
Lyric Video Builder - FastAPI backend
"""

import os
import shutil
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

UPLOADS_DIR = Path(os.environ.get("UPLOADS_DIR", str(Path(__file__).parent.parent / "uploads")))
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Lyric Video Builder")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Render job store  { job_id: { status, progress, output_path, error } }
jobs: dict[str, dict[str, Any]] = {}

# Transcribe job store  { job_id: { status, progress, phase, segments, error } }
transcribe_jobs: dict[str, dict[str, Any]] = {}


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def seconds_to_ass(s: float) -> str:
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sc = int(s % 60)
    cs = int(round((s % 1) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{sc:02d}.{cs:02d}"


def hex_to_ass(hex_color: str) -> str:
    """Convert #RRGGBB to ASS &H00BBGGRR format."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"&H00{b:02X}{g:02X}{r:02X}"


ALIGNMENT_MAP = {"top": 8, "center": 5, "bottom": 2}

FORMAT_DIMS = {
    "1080x1080": (1080, 1080),
    "1920x1080": (1920, 1080),
    "1080x1920": (1080, 1920),
}


def anim_tag(s: dict, w: int, h: int) -> str:
    """Return an ASS override tag string for the configured animation, or ''."""
    atype = s.get("animationType", "none")
    dur = int(s.get("animationDuration", 200))
    if atype == "none" or dur <= 0:
        return ""

    if atype == "fade":
        return f"\\fad({dur},0)"

    if atype == "grow":
        # Scale from 5% → 100% while fading in
        return f"\\fscx5\\fscy5\\fad({dur},0)\\t(0,{dur},\\fscx100\\fscy100)"

    # Slide animations — compute target anchor coords matching the ASS style alignment
    position = s.get("position", "bottom")
    font_size = int(s.get("fontSize", 72))
    margin_v = int(h * 0.06)
    cx = w // 2

    alignment = ALIGNMENT_MAP.get(position, 2)
    if alignment == 8:      # top-center: anchor at top of text
        cy = margin_v
    elif alignment == 5:    # center
        cy = h // 2
    else:                   # bottom-center (2): anchor at baseline
        cy = h - margin_v

    SLIDE = int(h * 0.15)
    if atype == "slide-top":
        x1, y1 = cx, cy - SLIDE
    elif atype == "slide-bottom":
        x1, y1 = cx, cy + SLIDE
    elif atype == "slide-left":
        x1, y1 = cx - SLIDE, cy
    elif atype == "slide-right":
        x1, y1 = cx + SLIDE, cy
    else:
        return ""

    return f"\\move({x1},{y1},{cx},{cy},0,{dur})\\fad({dur},0)"


def build_ass(segments: list, styles: dict, fmt: str) -> str:
    """Build an ASS subtitle string from project segments + styles."""
    w, h = FORMAT_DIMS.get(fmt, (1080, 1080))

    # Collect all section types that appear in segments
    used_sections = {seg["section"] for seg in segments}

    default_style = {
        "fontSize": 72,
        "fontFamily": "Arial",
        "color": "#FFEE00",
        "outlineColor": "#000000",
        "outlineWidth": 4,
        "shadowBlur": 3,
        "position": "bottom",
        "displayMode": "word",
        "bold": True,
        "animationType": "none",
        "animationDuration": 200,
    }

    style_lines = []
    for section in used_sections:
        s = {**default_style, **styles.get(section, {})}
        bold_flag = "-1" if s["bold"] else "0"
        alignment = ALIGNMENT_MAP.get(s["position"], 2)
        margin_v = int(h * 0.06)
        style_lines.append(
            f"Style: {section},{s['fontFamily']},{s['fontSize']},"
            f"{hex_to_ass(s['color'])},{hex_to_ass(s['color'])},"
            f"{hex_to_ass(s['outlineColor'])},&HA0000000,"
            f"{bold_flag},0,0,0,100,100,2,0,1,"
            f"{s['outlineWidth']},{s['shadowBlur']},"
            f"{alignment},40,40,{margin_v},1"
        )

    header = (
        f"[Script Info]\n"
        f"ScriptType: v4.00+\n"
        f"PlayResX: {w}\n"
        f"PlayResY: {h}\n"
        f"WrapStyle: 2\n"
        f"ScaledBorderAndShadow: yes\n\n"
        f"[V4+ Styles]\n"
        f"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        f"OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        f"ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        f"Alignment, MarginL, MarginR, MarginV, Encoding\n"
        + "\n".join(style_lines)
        + "\n\n[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    event_lines = []
    for seg in segments:
        section = seg["section"]
        words = seg.get("words", [])
        if not words:
            continue

        s = {**default_style, **styles.get(section, {})}
        display_mode = s.get("displayMode", "word")

        tag = anim_tag(s, w, h)
        tag_str = "{" + tag + "}" if tag else ""

        if display_mode == "line":
            # Show entire segment as one subtitle
            t_start = words[0]["start"]
            t_end = words[-1]["end"]
            if t_end - t_start < 0.05:
                t_end = t_start + 0.05
            text = " ".join(wd["word"].strip() for wd in words if wd["word"].strip())
            event_lines.append(
                f"Dialogue: 0,{seconds_to_ass(t_start)},{seconds_to_ass(t_end)},"
                f"{section},,0,0,0,,{tag_str}{text}"
            )
        else:
            # Word-by-word
            for i, word in enumerate(words):
                t_start = word["start"]
                t_end = words[i + 1]["start"] if i + 1 < len(words) else word["end"]
                if t_end - t_start < 0.05:
                    t_end = t_start + 0.05
                text = word["word"].strip()
                if not text:
                    continue
                event_lines.append(
                    f"Dialogue: 0,{seconds_to_ass(t_start)},{seconds_to_ass(t_end)},"
                    f"{section},,0,0,0,,{tag_str}{text}"
                )

    return header + "\n".join(event_lines) + "\n"


def run_transcribe(job_id: str, session_dir: Path, language: str, model_size: str = "medium"):
    """Background thread: transcribe using faster-whisper (CTranslate2, ~4-6x faster than openai-whisper)."""
    def set_progress(pct: int, phase: str = ""):
        transcribe_jobs[job_id]["progress"] = pct
        if phase:
            transcribe_jobs[job_id]["phase"] = phase

    try:
        set_progress(2, "Loading model…")
        transcribe_jobs[job_id]["status"] = "running"

        audio_files = (
            list(session_dir.glob("*.mp3"))
            + list(session_dir.glob("*.wav"))
            + list(session_dir.glob("*.m4a"))
        )
        if not audio_files:
            raise RuntimeError("No audio file found in session")
        audio_path = audio_files[0]

        # --- Phase 1: Model loading (heartbeat 2 → 14%) ---------------------
        stop_heartbeat = threading.Event()

        def heartbeat():
            while not stop_heartbeat.is_set():
                cur = transcribe_jobs[job_id]["progress"]
                if cur < 14:
                    transcribe_jobs[job_id]["progress"] = min(14, cur + 0.4)
                stop_heartbeat.wait(1.0)

        hb = threading.Thread(target=heartbeat, daemon=True)
        hb.start()

        from faster_whisper import WhisperModel   # lazy import
        # int8 quantization: fastest CPU inference, negligible quality loss
        model = WhisperModel(model_size, device="cpu", compute_type="int8")

        stop_heartbeat.set()
        hb.join()
        set_progress(15, "Transcribing…")

        # --- Phase 2: Transcription ------------------------------------------
        # faster-whisper returns a lazy generator; we consume it and update
        # progress from each segment's start time vs total audio duration.
        lang = None if language == "auto" else language
        segments_gen, info = model.transcribe(
            str(audio_path),
            word_timestamps=True,
            language=lang,
        )
        total_dur = info.duration or 1.0

        segments_out = []
        for seg in segments_gen:
            pct = 15 + int(seg.start / total_dur * 80)
            set_progress(min(95, max(15, pct)))

            words = list(seg.words or [])
            if not words:
                text_words = seg.text.strip().split()
                if not text_words:
                    continue
                seg_dur = (seg.end - seg.start) / len(text_words)
                word_list = [
                    {
                        "word": w,
                        "start": seg.start + j * seg_dur,
                        "end": seg.start + (j + 1) * seg_dur,
                    }
                    for j, w in enumerate(text_words)
                ]
            else:
                word_list = [
                    {"word": w.word, "start": w.start, "end": w.end}
                    for w in words
                ]

            segments_out.append({
                "id": str(uuid.uuid4()),
                "section": "verse",
                "words": word_list,
            })

        transcribe_jobs[job_id]["segments"] = segments_out
        set_progress(100, "Done")
        transcribe_jobs[job_id]["status"] = "done"

    except Exception as exc:
        transcribe_jobs[job_id]["status"] = "error"
        transcribe_jobs[job_id]["error"] = str(exc)


def run_render(job_id: str, session_dir: Path, project: dict):
    """Background thread: generate ASS + run FFmpeg."""
    try:
        jobs[job_id]["status"] = "running"
        jobs[job_id]["progress"] = 5

        # Write ASS
        ass_content = build_ass(
            project["segments"],
            project.get("styles", {}),
            project.get("format", "1080x1080"),
        )
        ass_path = session_dir / "output.ass"
        ass_path.write_text(ass_content, encoding="utf-8")
        jobs[job_id]["progress"] = 20

        # Paths
        audio_path = session_dir / project["audioFilename"]
        image_path = session_dir / project["imageFilename"]
        output_path = session_dir / "output.mp4"

        w, h = FORMAT_DIMS.get(project.get("format", "1080x1080"), (1080, 1080))

        # Escape ASS path for FFmpeg vf filter
        ass_escaped = str(ass_path).replace("\\", "\\\\").replace(":", "\\:")

        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-framerate", "24", "-i", str(image_path),
            "-i", str(audio_path),
            "-vf", f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
                   f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,ass={ass_escaped}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-shortest",
            str(output_path),
        ]

        jobs[job_id]["progress"] = 25

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        _, stderr = proc.communicate()

        if proc.returncode != 0:
            raise RuntimeError(f"FFmpeg failed:\n{stderr.decode()}")

        jobs[job_id]["progress"] = 100
        jobs[job_id]["status"] = "done"
        jobs[job_id]["output_path"] = str(output_path)

    except Exception as exc:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(exc)


# ──────────────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_files(
    audio: UploadFile = File(...),
    image: UploadFile = File(...),
):
    session_id = str(uuid.uuid4())
    session_dir = UPLOADS_DIR / session_id
    session_dir.mkdir(parents=True)

    # Save with original filename (sanitised)
    audio_name = Path(audio.filename).name
    image_name = Path(image.filename).name

    with open(session_dir / audio_name, "wb") as f:
        shutil.copyfileobj(audio.file, f)
    with open(session_dir / image_name, "wb") as f:
        shutil.copyfileobj(image.file, f)

    return {
        "session_id": session_id,
        "audioFilename": audio_name,
        "imageFilename": image_name,
    }


@app.post("/api/transcribe/{session_id}")
async def start_transcribe(
    session_id: str,
    language: str = Form("auto"),
    model: str = Form("medium"),
):
    session_dir = UPLOADS_DIR / session_id
    if not session_dir.exists():
        raise HTTPException(404, "Session not found")

    job_id = str(uuid.uuid4())
    transcribe_jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "phase": "Starting…",
        "segments": None,
        "error": None,
    }

    thread = threading.Thread(
        target=run_transcribe,
        args=(job_id, session_dir, language, model),
        daemon=True,
    )
    thread.start()

    return {"transcribe_job_id": job_id}


@app.get("/api/transcribe/{job_id}/status")
async def transcribe_status(job_id: str):
    if job_id not in transcribe_jobs:
        raise HTTPException(404, "Transcribe job not found")
    job = transcribe_jobs[job_id]
    return {
        "status": job["status"],
        "progress": job["progress"],
        "phase": job.get("phase", ""),
        "segments": job["segments"],
        "error": job.get("error"),
    }


@app.get("/api/files/{session_id}/{filename}")
async def get_file(session_id: str, filename: str):
    file_path = UPLOADS_DIR / session_id / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(str(file_path))


@app.post("/api/render/{session_id}")
async def start_render(session_id: str, project: dict):
    session_dir = UPLOADS_DIR / session_id
    if not session_dir.exists():
        raise HTTPException(404, "Session not found")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "pending", "progress": 0, "output_path": None, "error": None}

    thread = threading.Thread(
        target=run_render,
        args=(job_id, session_dir, project),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id}


@app.get("/api/render/{job_id}/status")
async def render_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = jobs[job_id]
    return {
        "status": job["status"],
        "progress": job["progress"],
        "error": job.get("error"),
    }


@app.get("/api/render/{job_id}/download")
async def download_render(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    job = jobs[job_id]
    if job["status"] != "done":
        raise HTTPException(400, f"Render not complete (status: {job['status']})")
    output_path = Path(job["output_path"])
    if not output_path.exists():
        raise HTTPException(500, "Output file missing")

    def iterfile():
        with open(output_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    filename = output_path.name
    return StreamingResponse(
        iterfile(),
        media_type="video/mp4",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
