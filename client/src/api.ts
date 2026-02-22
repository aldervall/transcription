import type { Project, Segment } from './types'

const BASE = '/api'

export async function uploadFiles(audio: File, image: File): Promise<{
  session_id: string
  audioFilename: string
  imageFilename: string
}> {
  const fd = new FormData()
  fd.append('audio', audio)
  fd.append('image', image)
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function startTranscribe(
  sessionId: string,
  language: string,
  model: string,
): Promise<{ transcribe_job_id: string }> {
  const fd = new FormData()
  fd.append('language', language)
  fd.append('model', model)
  const res = await fetch(`${BASE}/transcribe/${sessionId}`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getTranscribeStatus(jobId: string): Promise<{
  status: 'pending' | 'running' | 'done' | 'error'
  progress: number
  phase: string
  segments: Segment[] | null
  error?: string
}> {
  const res = await fetch(`${BASE}/transcribe/${jobId}/status`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function startRender(
  sessionId: string,
  project: Project
): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/render/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getRenderStatus(jobId: string): Promise<{
  status: 'pending' | 'running' | 'done' | 'error'
  progress: number
  error?: string
}> {
  const res = await fetch(`${BASE}/render/${jobId}/status`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function getDownloadUrl(jobId: string): string {
  return `${BASE}/render/${jobId}/download`
}

export function getFileUrl(sessionId: string, filename: string): string {
  return `${BASE}/files/${sessionId}/${filename}`
}
