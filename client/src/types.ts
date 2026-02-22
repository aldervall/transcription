export type SectionType = 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro' | string

export interface Word {
  word: string
  start: number
  end: number
}

export interface Segment {
  id: string
  section: SectionType
  words: Word[]
}

export type AnimationType = 'none' | 'fade' | 'grow' | 'slide-top' | 'slide-bottom' | 'slide-left' | 'slide-right'

export interface SectionStyle {
  fontSize: number
  fontFamily: string
  color: string
  outlineColor: string
  outlineWidth: number
  shadowBlur: number
  position: 'top' | 'center' | 'bottom'
  displayMode: 'word' | 'line'
  bold: boolean
  animationType: AnimationType
  animationDuration: number   // milliseconds
}

export type Format = '1080x1080' | '1920x1080' | '1080x1920'

export interface Project {
  sessionId: string
  audioFilename: string
  imageFilename: string
  segments: Segment[]
  styles: Record<SectionType, SectionStyle>
  format: Format
  language: string
}

export const DEFAULT_STYLE: SectionStyle = {
  fontSize: 72,
  fontFamily: 'Arial',
  color: '#FFEE00',
  outlineColor: '#000000',
  outlineWidth: 4,
  shadowBlur: 3,
  position: 'bottom',
  displayMode: 'word',
  bold: true,
  animationType: 'none',
  animationDuration: 200,
}

export const SECTION_COLORS: Record<string, string> = {
  verse: '#3b82f6',
  chorus: '#ec4899',
  bridge: '#a855f7',
  intro: '#22c55e',
  outro: '#f97316',
}

export function getSectionColor(section: string): string {
  return SECTION_COLORS[section] ?? '#6b7280'
}
