import { useState, useEffect, useRef } from 'react'
import type { SectionStyle, AnimationType } from '../types'
import { DEFAULT_STYLE, getSectionColor } from '../types'

// ── Font catalogue ────────────────────────────────────────────────────────────
interface FontEntry { name: string; label: string; category: string }

const FONT_LIST: FontEntry[] = [
  // Bold / Chorus impact
  { name: 'Bebas Neue',       label: 'Bebas Neue',       category: 'Bold caps'   },
  { name: 'Anton',            label: 'Anton',             category: 'Bold caps'   },
  { name: 'Bangers',          label: 'Bangers',           category: 'Bold caps'   },
  { name: 'Black Han Sans',   label: 'Black Han Sans',    category: 'Bold caps'   },
  { name: 'Russo One',        label: 'Russo One',         category: 'Bold caps'   },
  { name: 'Impact',           label: 'Impact',            category: 'Bold caps'   },
  // Condensed
  { name: 'Oswald',           label: 'Oswald',            category: 'Condensed'   },
  { name: 'Barlow Condensed', label: 'Barlow Condensed',  category: 'Condensed'   },
  // Modern / Verse
  { name: 'Montserrat',       label: 'Montserrat',        category: 'Modern'      },
  { name: 'Poppins',          label: 'Poppins',           category: 'Modern'      },
  { name: 'Raleway',          label: 'Raleway',           category: 'Modern'      },
  { name: 'Nunito',           label: 'Nunito',            category: 'Modern'      },
  // Script / Handwritten
  { name: 'Dancing Script',   label: 'Dancing Script',    category: 'Script'      },
  { name: 'Pacifico',         label: 'Pacifico',          category: 'Script'      },
  { name: 'Lobster',          label: 'Lobster',           category: 'Script'      },
  { name: 'Permanent Marker', label: 'Permanent Marker',  category: 'Script'      },
  // Fun / Display
  { name: 'Boogaloo',         label: 'Boogaloo',          category: 'Display'     },
  { name: 'Fredoka',          label: 'Fredoka',           category: 'Display'     },
  { name: 'Righteous',        label: 'Righteous',         category: 'Display'     },
  // Classic system
  { name: 'Arial',            label: 'Arial',             category: 'System'      },
  { name: 'Georgia',          label: 'Georgia',           category: 'System'      },
]

// Group fonts by category preserving insertion order
const FONT_CATEGORIES = FONT_LIST.reduce<Record<string, FontEntry[]>>((acc, f) => {
  ;(acc[f.category] ??= []).push(f)
  return acc
}, {})

// ── FontPicker ────────────────────────────────────────────────────────────────
function FontPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded px-3 py-2 flex items-center justify-between gap-2 transition-colors"
      >
        <span style={{ fontFamily: value }} className="text-gray-100 text-base truncate">
          {value}
        </span>
        <span className="text-gray-500 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-h-72 overflow-y-auto">
          {Object.entries(FONT_CATEGORIES).map(([cat, fonts]) => (
            <div key={cat}>
              <div className="px-3 py-1 text-xs text-gray-600 uppercase tracking-wider bg-gray-900 sticky top-0">
                {cat}
              </div>
              {fonts.map((f) => (
                <button
                  key={f.name}
                  onClick={() => { onChange(f.name); setOpen(false) }}
                  className={`w-full px-3 py-2 text-left flex items-baseline gap-2 hover:bg-gray-800 transition-colors ${
                    value === f.name ? 'bg-indigo-900/40' : ''
                  }`}
                >
                  <span style={{ fontFamily: f.name }} className="text-gray-100 text-lg leading-tight">
                    {f.label}
                  </span>
                  {value === f.name && <span className="text-indigo-400 text-xs ml-auto">✓</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sub-controls ──────────────────────────────────────────────────────────────
function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
        />
        <span className="text-xs text-gray-500 font-mono">{value.toUpperCase()}</span>
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs text-gray-400 font-mono">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </div>
  )
}

function ToggleGroup<T extends string>({ label, options, value, onChange }: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`text-xs px-2 py-1 rounded flex-1 transition-colors ${
              value === o.value ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  sections: string[]
  styles: Record<string, SectionStyle>
  onStyleChange: (section: string, updates: Partial<SectionStyle>) => void
}

export default function StyleEditor({ sections, styles, onStyleChange }: Props) {
  const [activeSection, setActiveSection] = useState(sections[0] ?? 'verse')

  const current = sections.includes(activeSection) ? activeSection : sections[0]
  const style: SectionStyle = { ...DEFAULT_STYLE, ...styles[current] }
  const update = (updates: Partial<SectionStyle>) => onStyleChange(current, updates)

  return (
    <div className="flex flex-col h-full">
      {/* Section tabs — sticky header */}
      <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur border-b border-gray-700 px-4 py-2.5">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Style</span>
        <div className="flex flex-wrap gap-1.5">
          {sections.map((s) => {
            const color = getSectionColor(s)
            const isActive = s === current
            return (
              <button
                key={s}
                onClick={() => setActiveSection(s)}
                className="text-xs px-2.5 py-1 rounded-full capitalize font-medium transition-all"
                style={{
                  backgroundColor: isActive ? color : color + '18',
                  color: isActive ? '#fff' : color,
                  border: `1.5px solid ${color}`,
                }}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      {/* Controls */}
      {current ? (
        <div className="flex-1 px-4 py-3 space-y-4">
          {/* Font picker */}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-500">Font</span>
            <FontPicker value={style.fontFamily} onChange={(v) => update({ fontFamily: v })} />
          </div>

          {/* Size + Bold */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <Slider label="Font size" value={style.fontSize} min={20} max={150} onChange={(v) => update({ fontSize: v })} />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-500">Bold</span>
              <button
                onClick={() => update({ bold: !style.bold })}
                className={`text-xs px-3 py-1.5 rounded w-full transition-colors ${
                  style.bold ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {style.bold ? 'Bold ✓' : 'Normal'}
              </button>
            </div>
          </div>

          {/* Outline + Shadow */}
          <div className="grid grid-cols-2 gap-3">
            <Slider label="Outline" value={style.outlineWidth} min={0} max={12} onChange={(v) => update({ outlineWidth: v })} />
            <Slider label="Shadow" value={style.shadowBlur} min={0} max={30} onChange={(v) => update({ shadowBlur: v })} />
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <ColorSwatch label="Text color" value={style.color} onChange={(v) => update({ color: v })} />
            <ColorSwatch label="Outline color" value={style.outlineColor} onChange={(v) => update({ outlineColor: v })} />
          </div>

          {/* Position */}
          <ToggleGroup
            label="Position"
            options={[
              { value: 'top',    label: '▲ Top'    },
              { value: 'center', label: '● Center' },
              { value: 'bottom', label: '▼ Bottom' },
            ]}
            value={style.position}
            onChange={(v) => update({ position: v })}
          />

          {/* Display mode */}
          <ToggleGroup
            label="Display mode"
            options={[
              { value: 'word', label: 'Word by word' },
              { value: 'line', label: 'Full line'    },
            ]}
            value={style.displayMode}
            onChange={(v) => update({ displayMode: v })}
          />

          {/* Animation */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Animation</span>
            <select
              value={style.animationType}
              onChange={(e) => update({ animationType: e.target.value as AnimationType })}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 w-full"
            >
              <option value="none">None</option>
              <option value="fade">Fade in</option>
              <option value="grow">Grow</option>
              <option value="slide-top">Slide from top</option>
              <option value="slide-bottom">Slide from bottom</option>
              <option value="slide-left">Slide from left</option>
              <option value="slide-right">Slide from right</option>
            </select>
          </div>

          {style.animationType !== 'none' && (
            <Slider
              label="Duration (ms)"
              value={style.animationDuration}
              min={50}
              max={500}
              onChange={(v) => update({ animationDuration: v })}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-gray-600 text-sm">Transcribe a song to edit styles</span>
        </div>
      )}
    </div>
  )
}
