import type { Segment } from '../types'
import { getSectionColor } from '../types'

const SECTION_OPTIONS = ['verse', 'chorus', 'bridge', 'intro', 'outro']

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

interface Props {
  segments: Segment[]
  customSections: string[]
  onSegmentChange: (id: string, updates: Partial<Segment>) => void
  onAddCustomSection: (name: string) => void
  currentTime: number
}

export default function TranscriptEditor({
  segments,
  customSections,
  onSegmentChange,
  onAddCustomSection,
  currentTime,
}: Props) {
  const allSections = [...SECTION_OPTIONS, ...customSections]

  const handleAddSection = () => {
    const name = window.prompt('New section name (e.g. "pre-chorus"):')
    if (name?.trim()) onAddCustomSection(name.trim().toLowerCase().replace(/\s+/g, '-'))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header — matches StyleEditor header height */}
      <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur border-b border-gray-700 px-4 py-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lyrics</span>
        <button
          onClick={handleAddSection}
          className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-700 hover:border-indigo-500 rounded px-2 py-0.5 transition-colors"
        >
          + section type
        </button>
      </div>

      {/* Segment list */}
      {segments.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-gray-600 text-sm">Upload and transcribe a song to see lyrics here</span>
        </div>
      ) : (
        <div className="px-3 py-2 space-y-0.5">
          {segments.map((seg) => {
            const segStart = seg.words[0]?.start ?? 0
            const segEnd = seg.words[seg.words.length - 1]?.end ?? 0
            const isActive = currentTime >= segStart && currentTime <= segEnd
            const color = getSectionColor(seg.section)
            const text = seg.words.map((w) => w.word).join(' ')

            return (
              <div
                key={seg.id}
                className={`flex gap-2 items-center rounded-md px-2 py-1.5 transition-colors ${
                  isActive ? 'bg-gray-700/70' : 'hover:bg-gray-800/40'
                }`}
                style={{ borderLeft: `3px solid ${color}` }}
              >
                {/* Timestamp */}
                <span className="text-gray-600 text-xs w-9 shrink-0 tabular-nums">
                  {formatTime(segStart)}
                </span>

                {/* Section badge / select */}
                <select
                  value={seg.section}
                  onChange={(e) => onSegmentChange(seg.id, { section: e.target.value })}
                  className="bg-transparent border rounded text-xs px-1.5 py-0.5 shrink-0 cursor-pointer capitalize"
                  style={{ borderColor: color + '80', color }}
                >
                  {allSections.map((s) => (
                    <option key={s} value={s} className="bg-gray-900 text-gray-200">{s}</option>
                  ))}
                </select>

                {/* Editable lyric text */}
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    const newText = e.currentTarget.textContent ?? ''
                    if (newText === text) return
                    const newWords = newText.trim().split(/\s+/)
                    const updated = seg.words.map((w, i) => ({
                      ...w,
                      word: newWords[i] !== undefined ? ' ' + newWords[i] : w.word,
                    }))
                    onSegmentChange(seg.id, { words: updated })
                  }}
                  className={`text-sm flex-1 outline-none leading-relaxed transition-colors ${
                    isActive ? 'text-white' : 'text-gray-300'
                  }`}
                >
                  {text}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
