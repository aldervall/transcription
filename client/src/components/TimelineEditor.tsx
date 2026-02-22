import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import type { Segment } from '../types'
import { getSectionColor } from '../types'

interface Props {
  segments: Segment[]
  currentTime: number
  duration: number
  onSegmentChange: (id: string, updates: Partial<Segment>) => void
  onSeek: (t: number) => void
}

const RULER_H = 22
const TRACK_H = 36

// Separator that won't appear in UUIDs
const SEP = '|'
const wordKey = (segId: string, wi: number) => `${segId}${SEP}${wi}`
const parseKey = (key: string) => {
  const idx = key.lastIndexOf(SEP)
  return { segId: key.slice(0, idx), wi: parseInt(key.slice(idx + 1)) }
}

function rulerLabel(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m === 0) return `${sec % 1 === 0 ? sec : sec.toFixed(1)}s`
  return `${m}:${Math.floor(sec).toString().padStart(2, '0')}`
}

export default function TimelineEditor({
  segments,
  currentTime,
  duration,
  onSegmentChange,
  onSeek,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const lastFlatIdx = useRef<number>(-1)

  const totalWidth = Math.max((duration + 2) * zoom, 200)

  // Flat list of all words (for range-select)
  const flatWords = useMemo(() =>
    segments.flatMap((seg) =>
      seg.words.map((_, wi) => ({ segId: seg.id, wi, key: wordKey(seg.id, wi) }))
    ), [segments])

  // ── Fit zoom ────────────────────────────────────────────────────────────────
  const fit = useCallback(() => {
    const w = scrollRef.current?.clientWidth ?? 900
    if (duration > 0) setZoom(Math.max(4, (w - 20) / (duration + 2)))
  }, [duration])

  useEffect(() => { if (duration > 0 && zoom === 0) fit() }, [duration, zoom, fit])

  // ── Ruler ticks ─────────────────────────────────────────────────────────────
  const tickInterval = useMemo(() => {
    if (zoom >= 300) return 0.5
    if (zoom >= 100) return 1
    if (zoom >= 50)  return 2
    if (zoom >= 20)  return 5
    if (zoom >= 8)   return 10
    return 30
  }, [zoom])

  const ticks = useMemo(() => {
    if (zoom === 0 || duration === 0) return []
    const result: number[] = []
    for (let t = 0; t <= duration + tickInterval; t += tickInterval)
      result.push(Math.round(t * 100) / 100)
    return result
  }, [tickInterval, duration, zoom])

  // ── Auto-scroll playhead ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el || zoom === 0) return
    const x = currentTime * zoom
    const { scrollLeft, clientWidth } = el
    if (x < scrollLeft + 30 || x > scrollLeft + clientWidth - 30)
      el.scrollLeft = Math.max(0, x - clientWidth / 3)
  }, [currentTime, zoom])

  // ── Selection helpers ────────────────────────────────────────────────────────
  const selectAll  = () => setSelected(new Set(flatWords.map((w) => w.key)))
  const selectNone = () => { setSelected(new Set()); lastFlatIdx.current = -1 }

  // Nudge all selected words by deltaS seconds
  const nudge = useCallback((deltaS: number) => {
    if (selected.size === 0) return
    const bySegId = new Map<string, number[]>()
    for (const key of selected) {
      const { segId, wi } = parseKey(key)
      if (!bySegId.has(segId)) bySegId.set(segId, [])
      bySegId.get(segId)!.push(wi)
    }
    for (const [segId, indices] of bySegId) {
      const seg = segments.find((s) => s.id === segId)
      if (!seg) continue
      const newWords = seg.words.map((w, i) =>
        indices.includes(i)
          ? { ...w, start: Math.max(0, w.start + deltaS), end: Math.max(0, w.end + deltaS) }
          : w
      )
      onSegmentChange(segId, { words: newWords })
    }
  }, [selected, segments, onSegmentChange])

  // Keyboard nudge (← →, Shift for coarse)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected.size === 0) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      // Don't steal from inputs
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      e.preventDefault()
      const step = e.shiftKey ? 0.05 : 0.01
      nudge(e.key === 'ArrowLeft' ? -step : step)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, nudge])

  // ── Drag ────────────────────────────────────────────────────────────────────
  const dragRef = useRef<{
    startMouseX: number
    // segId → { wordIdx → { origStart, wordDur } }
    originals: Map<string, Map<number, { origStart: number; wordDur: number }>>
  } | null>(null)

  const startDrag = useCallback((
    e: React.MouseEvent,
    draggingKeys: Set<string>,
  ) => {
    const originals = new Map<string, Map<number, { origStart: number; wordDur: number }>>()
    for (const key of draggingKeys) {
      const { segId, wi } = parseKey(key)
      const seg = segments.find((s) => s.id === segId)
      if (!seg) continue
      const word = seg.words[wi]
      if (!word) continue
      if (!originals.has(segId)) originals.set(segId, new Map())
      originals.get(segId)!.set(wi, { origStart: word.start, wordDur: word.end - word.start })
    }

    dragRef.current = { startMouseX: e.clientX, originals }

    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const dt = (ev.clientX - d.startMouseX) / zoom
      for (const [segId, wordMap] of d.originals) {
        const seg = segments.find((s) => s.id === segId)
        if (!seg) continue
        const newWords = seg.words.map((w, i) => {
          const orig = wordMap.get(i)
          if (!orig) return w
          const newStart = Math.max(0, orig.origStart + dt)
          return { ...w, start: newStart, end: newStart + orig.wordDur }
        })
        onSegmentChange(segId, { words: newWords })
      }
    }

    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [zoom, segments, onSegmentChange])

  const handleWordMouseDown = useCallback((
    e: React.MouseEvent,
    flatIdx: number,
    segId: string,
    wi: number,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const key = wordKey(segId, wi)

    if (e.shiftKey && lastFlatIdx.current >= 0) {
      // Range select — no drag
      const lo = Math.min(flatIdx, lastFlatIdx.current)
      const hi = Math.max(flatIdx, lastFlatIdx.current)
      const next = new Set(selected)
      for (let i = lo; i <= hi; i++) next.add(flatWords[i].key)
      setSelected(next)
      return
    }

    if (e.ctrlKey || e.metaKey) {
      // Toggle — no drag
      const next = new Set(selected)
      if (next.has(key)) next.delete(key); else next.add(key)
      setSelected(next)
      lastFlatIdx.current = flatIdx
      return
    }

    // Plain click / drag
    lastFlatIdx.current = flatIdx
    if (selected.has(key)) {
      // Drag all selected (word is already in selection)
      startDrag(e, selected)
    } else {
      // Select just this word and drag it
      const next = new Set([key])
      setSelected(next)
      startDrag(e, next)
    }
  }, [selected, flatWords, startDrag])

  // Click on ruler/empty track → seek + deselect
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (!el || zoom === 0) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left + el.scrollLeft
    onSeek(Math.max(0, x / zoom))
    selectNone()
  }

  const isEmpty = segments.length === 0 || zoom === 0

  return (
    <div className="flex flex-col border-t border-b border-gray-800" style={{ background: '#08080c' }}>

      {/* Controls bar */}
      <div className="flex items-center gap-2 px-3 shrink-0 flex-wrap" style={{ minHeight: 28 }}>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Timeline</span>

        {!isEmpty && (
          <>
            {/* Zoom */}
            <span className="text-gray-700 text-xs ml-2">Zoom</span>
            <input
              type="range" min={4} max={500} step={1} value={Math.round(zoom)}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 accent-indigo-500"
            />
            <span className="text-gray-600 text-xs w-12 shrink-0">{Math.round(zoom)}px/s</span>
            <button
              onClick={fit}
              className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded px-2 py-0.5 transition-colors"
            >fit</button>

            <div className="w-px h-4 bg-gray-700 mx-1" />

            {/* Selection */}
            <button
              onClick={selectAll}
              className="text-xs text-gray-500 hover:text-gray-200 border border-gray-700 hover:border-gray-500 rounded px-2 py-0.5 transition-colors"
            >select all</button>

            {selected.size > 0 && (
              <>
                <button
                  onClick={selectNone}
                  className="text-xs text-gray-500 hover:text-gray-200 border border-gray-700 hover:border-gray-500 rounded px-2 py-0.5 transition-colors"
                >deselect</button>

                <span className="text-xs text-indigo-400 font-mono">{selected.size} selected</span>

                <div className="w-px h-4 bg-gray-700 mx-1" />

                {/* Nudge buttons */}
                <span className="text-gray-600 text-xs">nudge</span>
                <button onClick={() => nudge(-0.05)} title="−50 ms (Shift+←)"
                  className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-1.5 py-0.5 font-mono transition-colors">
                  ««
                </button>
                <button onClick={() => nudge(-0.01)} title="−10 ms (←)"
                  className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-1.5 py-0.5 font-mono transition-colors">
                  «
                </button>
                <button onClick={() => nudge(0.01)} title="+10 ms (→)"
                  className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-1.5 py-0.5 font-mono transition-colors">
                  »
                </button>
                <button onClick={() => nudge(0.05)} title="+50 ms (Shift+→)"
                  className="text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-1.5 py-0.5 font-mono transition-colors">
                  »»
                </button>
              </>
            )}
          </>
        )}

        {isEmpty && (
          <span className="text-gray-700 text-xs">Transcribe a song to see the word timeline</span>
        )}

        {!isEmpty && (
          <span className="ml-auto text-xs text-gray-500 font-mono tabular-nums">
            {currentTime.toFixed(3)}s
          </span>
        )}
      </div>

      {/* Scrollable track area */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden"
        style={{ height: RULER_H + TRACK_H }}
      >
        {!isEmpty && (
          <div style={{ width: totalWidth, position: 'relative', height: '100%' }}>

            {/* ── Ruler ── */}
            <div
              style={{ height: RULER_H, position: 'relative', cursor: 'pointer' }}
              className="bg-gray-900"
              onClick={handleTrackClick}
            >
              {ticks.map((t) => (
                <div key={t} style={{ position: 'absolute', left: Math.round(t * zoom), top: 0 }}>
                  <div style={{ width: 1, height: 6, background: '#374151' }} />
                  <span style={{ fontSize: 9, color: '#6b7280', marginLeft: 2, userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {rulerLabel(t)}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Word track ── */}
            <div
              style={{ height: TRACK_H, position: 'relative', background: '#0d0d12', cursor: 'pointer' }}
              onClick={handleTrackClick}
            >
              {segments.flatMap((seg) =>
                seg.words.map((word, wi) => {
                  const key = wordKey(seg.id, wi)
                  const flatIdx = flatWords.findIndex((fw) => fw.key === key)
                  const x = Math.round(word.start * zoom)
                  const rawW = (word.end - word.start) * zoom
                  const blockW = Math.max(rawW - 1, 2)
                  const color = getSectionColor(seg.section)
                  const isSelected = selected.has(key)
                  const showLabel = blockW >= 16

                  return (
                    <div
                      key={key}
                      title={`${word.word.trim()}  ${word.start.toFixed(3)}s → ${word.end.toFixed(3)}s`}
                      style={{
                        position: 'absolute',
                        left: x,
                        top: 4,
                        width: blockW,
                        height: TRACK_H - 8,
                        backgroundColor: isSelected ? color + '55' : color + '28',
                        border: `${isSelected ? 2 : 1}px solid ${isSelected ? color : color + '70'}`,
                        borderRadius: 3,
                        cursor: 'grab',
                        boxSizing: 'border-box',
                        zIndex: isSelected ? 2 : 1,
                        boxShadow: isSelected ? `0 0 6px ${color}60` : 'none',
                      }}
                      onMouseDown={(e) => handleWordMouseDown(e, flatIdx, seg.id, wi)}
                    >
                      {showLabel && (
                        <span style={{
                          fontSize: 9,
                          color: isSelected ? '#fff' : color,
                          padding: '0 3px',
                          lineHeight: `${TRACK_H - 8}px`,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          display: 'block',
                          userSelect: 'none',
                          pointerEvents: 'none',
                          fontWeight: isSelected ? 600 : 400,
                        }}>
                          {word.word.trim()}
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* ── Playhead ── */}
            <div style={{
              position: 'absolute',
              left: Math.round(currentTime * zoom),
              top: 0,
              height: '100%',
              width: 1.5,
              background: '#ef4444',
              pointerEvents: 'none',
              zIndex: 10,
            }}>
              <div style={{
                position: 'absolute', top: 0, left: -4,
                width: 9, height: 9, background: '#ef4444',
                clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
              }} />
            </div>

          </div>
        )}
      </div>

      {/* Hint bar */}
      {!isEmpty && (
        <div className="px-3 py-0.5 text-gray-700 text-xs" style={{ fontSize: 10 }}>
          Click to select · Ctrl+click to toggle · Shift+click to range-select · Drag to move · ← → to nudge 10ms · Shift+← → for 50ms
        </div>
      )}
    </div>
  )
}
