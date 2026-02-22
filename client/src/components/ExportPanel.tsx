import { useState, useEffect, useRef } from 'react'
import type { Project, Format } from '../types'
import { startRender, getRenderStatus, getDownloadUrl } from '../api'

const FORMATS: { value: Format; label: string }[] = [
  { value: '1080x1080', label: 'Square 1080×1080' },
  { value: '1920x1080', label: 'Landscape 1920×1080' },
  { value: '1080x1920', label: 'Portrait 1080×1920' },
]

interface Props {
  project: Project | null
  format: Format
  onFormatChange: (f: Format) => void
}

export default function ExportPanel({ project, format, onFormatChange }: Props) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'pending' | 'running' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  const handleRender = async () => {
    if (!project) return
    setStatus('pending')
    setProgress(0)
    setError('')
    setJobId(null)

    try {
      const { job_id } = await startRender(project.sessionId, { ...project, format })
      setJobId(job_id)

      pollRef.current = setInterval(async () => {
        try {
          const s = await getRenderStatus(job_id)
          setProgress(s.progress)
          if (s.status === 'done') {
            setStatus('done')
            stopPolling()
          } else if (s.status === 'error') {
            setStatus('error')
            setError(s.error ?? 'Unknown render error')
            stopPolling()
          } else {
            setStatus(s.status as any)
          }
        } catch (e: any) {
          setStatus('error')
          setError(e.message)
          stopPolling()
        }
      }, 1000)
    } catch (e: any) {
      setStatus('error')
      setError(e.message)
    }
  }

  const canRender = project && project.segments.length > 0 && status !== 'running' && status !== 'pending'

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">3. Export</h2>

      {/* Format selector */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400">Format</p>
        {FORMATS.map((f) => (
          <label key={f.value} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="format"
              value={f.value}
              checked={format === f.value}
              onChange={() => onFormatChange(f.value)}
              className="accent-indigo-500"
            />
            <span className="text-sm text-gray-300">{f.label}</span>
          </label>
        ))}
      </div>

      {/* Render button */}
      <button
        onClick={handleRender}
        disabled={!canRender}
        className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-gray-700 disabled:text-gray-500
                   text-white rounded py-2 text-sm font-medium transition-colors"
      >
        {status === 'pending' || status === 'running' ? 'Rendering…' : 'Render Video'}
      </button>

      {/* Progress */}
      {(status === 'pending' || status === 'running') && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Rendering with FFmpeg…</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded overflow-hidden">
            <div
              className="h-full bg-rose-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Done */}
      {status === 'done' && jobId && (
        <a
          href={getDownloadUrl(jobId)}
          download="lyric_video.mp4"
          className="block w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded py-2 text-sm
                     font-medium text-center transition-colors"
        >
          Download MP4
        </a>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="bg-red-900/30 border border-red-700 rounded p-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      {/* Info */}
      {!project && (
        <p className="text-gray-600 text-xs">Upload and transcribe a song first</p>
      )}
    </div>
  )
}
