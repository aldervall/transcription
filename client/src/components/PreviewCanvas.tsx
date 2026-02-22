import { useEffect, useRef, useState } from 'react'
import type { Segment, SectionStyle, Format } from '../types'
import { DEFAULT_STYLE } from '../types'

const FORMAT_DIMS: Record<Format, [number, number]> = {
  '1080x1080': [1080, 1080],
  '1920x1080': [1920, 1080],
  '1080x1920': [1080, 1920],
}

interface Props {
  sessionId: string
  audioFilename: string
  imageFilename: string
  segments: Segment[]
  styles: Record<string, SectionStyle>
  format: Format
  onTimeUpdate: (t: number, duration?: number) => void
  onRegisterSeek?: (fn: (t: number) => void) => void
}

function findActiveContent(
  segments: Segment[],
  styles: Record<string, SectionStyle>,
  currentTime: number
): { text: string; style: SectionStyle; section: string; wordStart: number } | null {
  for (const seg of segments) {
    const segStart = seg.words[0]?.start ?? Infinity
    const segEnd = seg.words[seg.words.length - 1]?.end ?? -Infinity
    if (currentTime < segStart || currentTime > segEnd) continue

    const sectionStyle: SectionStyle = { ...DEFAULT_STYLE, ...styles[seg.section] }

    if (sectionStyle.displayMode === 'line') {
      const text = seg.words.map((w) => w.word.trim()).filter(Boolean).join(' ')
      return { text, style: sectionStyle, section: seg.section, wordStart: segStart }
    } else {
      for (let i = 0; i < seg.words.length; i++) {
        const w = seg.words[i]
        const nextStart = seg.words[i + 1]?.start ?? w.end
        if (currentTime >= w.start && currentTime < nextStart) {
          return { text: w.word.trim(), style: sectionStyle, section: seg.section, wordStart: w.start }
        }
      }
    }
  }
  return null
}

/** Ease-out cubic: fast start, decelerates to final position. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, t), 3)
}

export default function PreviewCanvas({
  sessionId,
  audioFilename,
  imageFilename,
  segments,
  styles,
  format,
  onTimeUpdate,
  onRegisterSeek,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const bgImageRef = useRef<HTMLImageElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const animFrameRef = useRef<number>(0)

  const [fw, fh] = FORMAT_DIMS[format]

  // Expose seek so parent can drive playhead from timeline
  useEffect(() => {
    onRegisterSeek?.((t: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = t
        setCurrentTime(t)
      }
    })
  }, [onRegisterSeek])

  // Load background image
  useEffect(() => {
    if (!sessionId || !imageFilename) return
    const img = new Image()
    img.src = `/api/files/${sessionId}/${imageFilename}`
    img.onload = () => { bgImageRef.current = img }
  }, [sessionId, imageFilename])

  // Canvas draw loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const t = audioRef.current?.currentTime ?? currentTime
      setCurrentTime(t)

      ctx.clearRect(0, 0, fw, fh)

      // Background
      if (bgImageRef.current) {
        const img = bgImageRef.current
        const scale = Math.max(fw / img.width, fh / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        ctx.drawImage(img, (fw - dw) / 2, (fh - dh) / 2, dw, dh)
      } else {
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, fw, fh)
      }

      // Text
      const active = findActiveContent(segments, styles, t)
      if (active) {
        const { text, style: s, wordStart } = active
        ctx.save()

        const fontWeight = s.bold ? 'bold' : 'normal'
        ctx.font = `${fontWeight} ${s.fontSize}px "${s.fontFamily}"`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'

        // Target position
        const pad = fh * 0.08
        let targetY: number
        if (s.position === 'top') targetY = pad + s.fontSize
        else if (s.position === 'center') targetY = fh / 2 + s.fontSize / 3
        else targetY = fh - pad

        // Animation progress (ease-out cubic)
        const animDurSec = s.animationDuration / 1000
        const ease = easeOut(animDurSec > 0 ? (t - wordStart) / animDurSec : 1)

        // Compute per-animation offsets
        const SLIDE = fh * 0.15
        let alpha = 1, dx = 0, dy = 0, scale = 1
        switch (s.animationType) {
          case 'fade':
            alpha = ease
            break
          case 'grow':
            scale = 0.1 + ease * 0.9
            alpha = ease
            break
          case 'slide-top':
            dy = -SLIDE * (1 - ease)
            alpha = ease
            break
          case 'slide-bottom':
            dy = SLIDE * (1 - ease)
            alpha = ease
            break
          case 'slide-left':
            dx = -SLIDE * (1 - ease)
            alpha = ease
            break
          case 'slide-right':
            dx = SLIDE * (1 - ease)
            alpha = ease
            break
        }

        ctx.globalAlpha = Math.max(0, Math.min(1, alpha))

        if (s.shadowBlur > 0) {
          ctx.shadowColor = 'rgba(0,0,0,0.8)'
          ctx.shadowBlur = s.shadowBlur
        }

        // Translate to final position + animation offset, then scale for grow
        ctx.translate(fw / 2 + dx, targetY + dy)
        if (scale !== 1) ctx.scale(scale, scale)

        if (s.outlineWidth > 0) {
          ctx.strokeStyle = s.outlineColor
          ctx.lineWidth = s.outlineWidth * 2
          ctx.lineJoin = 'round'
          ctx.strokeText(text, 0, 0)
        }
        ctx.fillStyle = s.color
        ctx.fillText(text, 0, 0)

        ctx.restore()
      }

      animFrameRef.current = requestAnimationFrame(draw)
    }

    animFrameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [segments, styles, format, fw, fh, currentTime])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) { audio.pause(); setPlaying(false) }
    else { audio.play(); setPlaying(true) }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = t
    setCurrentTime(t)
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  // Fit the canvas inside a max bounding box, maintaining aspect ratio.
  // maxH is generous so landscape (16:9) gets a tall enough render.
  const maxDisplayW = 760
  const maxDisplayH = 440
  const scale = Math.min(maxDisplayW / fw, maxDisplayH / fh)
  const displayW = Math.round(fw * scale)
  const displayH = Math.round(fh * scale)

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Preview</h2>

      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={fw}
          height={fh}
          style={{ width: displayW, height: displayH }}
          className="rounded border border-gray-700 bg-black"
        />
      </div>

      {/* Audio element */}
      {sessionId && audioFilename && (
        <audio
          ref={audioRef}
          src={`/api/files/${sessionId}/${audioFilename}`}
          onTimeUpdate={() => { const t = audioRef.current?.currentTime ?? 0; setCurrentTime(t); onTimeUpdate(t) }}
          onLoadedMetadata={() => { const d = audioRef.current?.duration ?? 0; setDuration(d); onTimeUpdate(0, d) }}
          onEnded={() => setPlaying(false)}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          disabled={!sessionId}
          className="w-8 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white rounded-full text-sm flex items-center justify-center"
        >
          {playing ? '⏸' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="flex-1 accent-indigo-500"
        />
        <span className="text-xs text-gray-400 w-20 text-right">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>
    </div>
  )
}
