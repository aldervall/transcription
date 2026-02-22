import { useRef, useState } from 'react'
import type { DragEvent } from 'react'

interface Props {
  onUploaded: (sessionId: string, audioFilename: string, imageFilename: string, language: string) => void
  onTranscribe: () => void
  transcribing: boolean
  transcribeProgress: number
  transcribePhase: string
  hasSession: boolean
  whisperModel: string
  onWhisperModelChange: (m: string) => void
}

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'sv', label: 'Swedish' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'da', label: 'Danish' },
]

function DropZone({
  accept,
  label,
  file,
  onFile,
}: {
  accept: string
  label: string
  file: File | null
  onFile: (f: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
        ${dragging ? 'border-indigo-400 bg-indigo-900/20' : 'border-gray-600 hover:border-gray-400'}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
      {file ? (
        <div>
          <p className="text-green-400 font-medium text-sm truncate">{file.name}</p>
          <p className="text-gray-500 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
        </div>
      ) : (
        <div>
          <p className="text-gray-400 text-sm">{label}</p>
          <p className="text-gray-600 text-xs mt-1">drag & drop or click</p>
        </div>
      )}
    </div>
  )
}

const WHISPER_MODELS = [
  { value: 'tiny',     label: 'Tiny',     hint: '~1 min — rough' },
  { value: 'base',     label: 'Base',     hint: '~2 min — fast'  },
  { value: 'small',    label: 'Small',    hint: '~4 min — good'  },
  { value: 'medium',   label: 'Medium',   hint: '~8 min — great' },
  { value: 'large-v3', label: 'Large v3', hint: '~15 min — best' },
]

export default function UploadPanel({ onUploaded, onTranscribe, transcribing, transcribeProgress, transcribePhase, hasSession, whisperModel, onWhisperModelChange }: Props) {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('sv')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleUpload = async () => {
    if (!audioFile || !imageFile) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('audio', audioFile)
      fd.append('image', imageFile)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      onUploaded(data.session_id, data.audioFilename, data.imageFilename, language)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">1. Upload</h2>

      <DropZone
        accept="audio/*,.mp3,.wav,.m4a"
        label="Drop MP3 / audio file"
        file={audioFile}
        onFile={setAudioFile}
      />
      <DropZone
        accept="image/*"
        label="Drop background image"
        file={imageFile}
        onFile={setImageFile}
      />

      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200"
      >
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>

      {/* Model picker — visible always so user can choose before transcribing */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-gray-500">Whisper model</span>
        <select
          value={whisperModel}
          onChange={(e) => onWhisperModelChange(e.target.value)}
          disabled={transcribing}
          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-200 disabled:opacity-50"
        >
          {WHISPER_MODELS.map((m) => (
            <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>
          ))}
        </select>
      </div>

      {!hasSession ? (
        <button
          onClick={handleUpload}
          disabled={!audioFile || !imageFile || uploading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500
                     text-white rounded py-2 text-sm font-medium transition-colors"
        >
          {uploading ? 'Uploading…' : 'Upload Files'}
        </button>
      ) : (
        <div className="space-y-2">
          <button
            onClick={onTranscribe}
            disabled={transcribing}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500
                       text-white rounded py-2 text-sm font-medium transition-colors"
          >
            {transcribing ? 'Transcribing…' : 'Transcribe'}
          </button>

          {transcribing && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>{transcribePhase || 'Starting…'}</span>
                <span>{Math.round(transcribeProgress)}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${transcribeProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
