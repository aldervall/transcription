import { useState, useCallback, useRef } from 'react'
import type {
  Project, Segment, SectionStyle, Format,
} from './types'
import { DEFAULT_STYLE } from './types'
import { startTranscribe, getTranscribeStatus } from './api'
import UploadPanel from './components/UploadPanel'
import TranscriptEditor from './components/TranscriptEditor'
import StyleEditor from './components/StyleEditor'
import PreviewCanvas from './components/PreviewCanvas'
import ExportPanel from './components/ExportPanel'
import TimelineEditor from './components/TimelineEditor'

const INITIAL_STYLES: Record<string, SectionStyle> = {
  verse:  { ...DEFAULT_STYLE, color: '#FFEE00', outlineColor: '#000000' },
  chorus: { ...DEFAULT_STYLE, fontSize: 90, color: '#FF1493', outlineColor: '#FF8C00', outlineWidth: 5 },
  bridge: { ...DEFAULT_STYLE, color: '#00BFFF', outlineColor: '#003366' },
  intro:  { ...DEFAULT_STYLE, fontSize: 60, color: '#AAAAAA', outlineColor: '#000000' },
  outro:  { ...DEFAULT_STYLE, fontSize: 60, color: '#AAAAAA', outlineColor: '#000000' },
}

export default function App() {
  const [project, setProject] = useState<Project | null>(null)
  const [customSections, setCustomSections] = useState<string[]>([])
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeProgress, setTranscribeProgress] = useState(0)
  const [transcribePhase, setTranscribePhase] = useState('')
  const [transcribeError, setTranscribeError] = useState('')
  const [whisperModel, setWhisperModel] = useState('medium')
  const [format, setFormat] = useState<Format>('1080x1080')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const seekFnRef = useRef<(t: number) => void>(() => {})

  const handleUploaded = (
    sessionId: string,
    audioFilename: string,
    imageFilename: string,
    language: string,
  ) => {
    setProject({
      sessionId,
      audioFilename,
      imageFilename,
      segments: [],
      styles: { ...INITIAL_STYLES },
      format,
      language,
    })
  }

  const handleTranscribe = async () => {
    if (!project) return
    setTranscribing(true)
    setTranscribeProgress(0)
    setTranscribeError('')
    try {
      const { transcribe_job_id } = await startTranscribe(project.sessionId, project.language, whisperModel)

      await new Promise<void>((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const s = await getTranscribeStatus(transcribe_job_id)
            setTranscribeProgress(s.progress)
            if (s.phase) setTranscribePhase(s.phase)
            if (s.status === 'done' && s.segments) {
              clearInterval(poll)
              setProject((p) => p ? { ...p, segments: s.segments! } : p)
              resolve()
            } else if (s.status === 'error') {
              clearInterval(poll)
              reject(new Error(s.error ?? 'Transcription failed'))
            }
          } catch (e) {
            clearInterval(poll)
            reject(e)
          }
        }, 600)
      })
    } catch (e: any) {
      setTranscribeError(e.message)
    } finally {
      setTranscribing(false)
      setTranscribeProgress(0)
      setTranscribePhase('')
    }
  }

  const handleSegmentChange = useCallback((id: string, updates: Partial<Segment>) => {
    setProject((p) => {
      if (!p) return p
      return {
        ...p,
        segments: p.segments.map((s) => s.id === id ? { ...s, ...updates } : s),
      }
    })
  }, [])

  const handleStyleChange = useCallback((section: string, updates: Partial<SectionStyle>) => {
    setProject((p) => {
      if (!p) return p
      return {
        ...p,
        styles: {
          ...p.styles,
          [section]: { ...(p.styles[section] ?? DEFAULT_STYLE), ...updates },
        },
      }
    })
  }, [])

  const handleAddCustomSection = (name: string) => {
    if (!customSections.includes(name)) {
      setCustomSections((prev) => [...prev, name])
      setProject((p) => {
        if (!p) return p
        return {
          ...p,
          styles: { ...p.styles, [name]: { ...DEFAULT_STYLE } },
        }
      })
    }
  }

  const usedSections = project
    ? [...new Set(['verse', 'chorus', 'bridge', ...project.segments.map((s) => s.section), ...customSections])]
    : ['verse', 'chorus', 'bridge']

  const projectWithFormat: Project | null = project ? { ...project, format } : null

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="shrink-0 border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <span className="text-base font-bold text-white tracking-tight">🎵 Lyric Video Builder</span>
        {transcribeError && (
          <span className="text-red-400 text-xs ml-4">{transcribeError}</span>
        )}
      </header>

      {/* ── Top row: Upload | Canvas | Export ── */}
      <div className="flex shrink-0" style={{ height: '48%' }}>
        {/* Upload sidebar */}
        <aside className="w-52 shrink-0 border-r border-gray-800 p-4 overflow-y-auto">
          <UploadPanel
            onUploaded={handleUploaded}
            onTranscribe={handleTranscribe}
            transcribing={transcribing}
            transcribeProgress={transcribeProgress}
            transcribePhase={transcribePhase}
            hasSession={!!project?.sessionId}
            whisperModel={whisperModel}
            onWhisperModelChange={setWhisperModel}
          />
        </aside>

        {/* Canvas — fills remaining width between sidebars */}
        <main className="flex-1 p-4 overflow-auto flex items-start justify-center">
          <PreviewCanvas
            sessionId={project?.sessionId ?? ''}
            audioFilename={project?.audioFilename ?? ''}
            imageFilename={project?.imageFilename ?? ''}
            segments={project?.segments ?? []}
            styles={project?.styles ?? {}}
            format={format}
            onTimeUpdate={(t, d) => { setCurrentTime(t); if (d !== undefined) setDuration(d) }}
            onRegisterSeek={(fn) => { seekFnRef.current = fn }}
          />
        </main>

        {/* Export sidebar */}
        <aside className="w-48 shrink-0 border-l border-gray-800 p-4 overflow-y-auto">
          <ExportPanel
            project={projectWithFormat}
            format={format}
            onFormatChange={setFormat}
          />
        </aside>
      </div>

      {/* ── Timeline strip ── */}
      <div className="shrink-0">
        <TimelineEditor
          segments={project?.segments ?? []}
          currentTime={currentTime}
          duration={duration}
          onSegmentChange={handleSegmentChange}
          onSeek={(t) => seekFnRef.current(t)}
        />
      </div>

      {/* ── Bottom unified panel: Style | Transcript ── */}
      <div className="flex flex-1 min-h-0 border-t-2 border-gray-700 bg-gray-900/60">
        {/* Style editor */}
        <div className="w-80 shrink-0 border-r border-gray-700 overflow-y-auto">
          <StyleEditor
            sections={usedSections}
            styles={project?.styles ?? INITIAL_STYLES}
            onStyleChange={handleStyleChange}
          />
        </div>

        {/* Transcript editor */}
        <div className="flex-1 overflow-y-auto">
          <TranscriptEditor
            segments={project?.segments ?? []}
            customSections={customSections}
            onSegmentChange={handleSegmentChange}
            onAddCustomSection={handleAddCustomSection}
            currentTime={currentTime}
          />
        </div>
      </div>
    </div>
  )
}
