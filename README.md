# Lyric Video Builder

A web app for creating lyric videos from audio files. Upload audio and a background image, auto-transcribe the audio with Whisper, edit the transcript, style each section, then render a video with burned-in subtitles via FFmpeg.

## Features

- **Auto-transcription** — powered by [faster-whisper](https://github.com/SYSTRAN/faster-whisper) with word-level timestamps
- **Transcript editor** — edit words, adjust timing, assign sections (verse, chorus, etc.)
- **Style editor** — per-section font, color, outline, shadow, position, and animation
- **Animations** — fade, grow, slide in from any direction
- **Export formats** — 1080×1080, 1920×1080, 1080×1920
- **Docker** — single `docker compose up` to run everything

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI + faster-whisper + FFmpeg |
| Infra | Docker Compose + nginx |

## Quick Start

### Docker (recommended)

```bash
docker compose up --build
```

Open http://localhost in your browser.

### Local Development

**Backend**
```bash
cd server
pip install -r requirements.txt
pip install faster-whisper
uvicorn main:app --reload
```

**Frontend**
```bash
cd client
npm install
npm run dev
```

Frontend runs on http://localhost:5173, backend on http://localhost:8000.

## Usage

1. **Upload** — select an audio file (mp3/wav/m4a) and a background image
2. **Transcribe** — choose language and model size, then click Transcribe
3. **Edit** — adjust words, timing, and section labels in the timeline
4. **Style** — configure fonts, colors, and animations per section
5. **Export** — pick a format and render; download the finished mp4

## Model Sizes

| Model | Speed | Accuracy |
|-------|-------|----------|
| `tiny` | Fastest | Lower |
| `base` | Fast | Good |
| `medium` | Balanced | Better |
| `large` | Slow | Best |

Models are downloaded automatically on first use and cached in a Docker volume.

## Requirements

- Docker + Docker Compose, **or**
- Python 3.10+, Node.js 18+, FFmpeg installed on PATH
