/**
 * Audio detection warnings for recording sessions.
 *
 * Monitors audio levels and transcript activity to warn the user about:
 * - No audio detected (microphone not working)
 * - No speech detected (nobody talking)
 * - Single voice detected (only one participant audible)
 *
 * Each warning fires at most once per recording session.
 */

import { useEffect, useRef, useCallback } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { toast } from 'sonner'
import { RecordingStatus } from '@/contexts/RecordingStateContext'
import type { Transcript } from '@/types'
import type { AudioLevelUpdate } from '@/components/DeviceSelection'

// ── Timing thresholds (ms) ──────────────────────────────────────────
const NO_AUDIO_THRESHOLD_MS = 30_000      // 30s with no audio signal
const NO_SPEECH_THRESHOLD_MS = 120_000    // 2 min with no transcript
const SINGLE_VOICE_THRESHOLD_MS = 180_000 // 3 min with no turn-taking

// A "turn gap" is silence between transcript segments suggesting a speaker change
const TURN_GAP_SECONDS = 3

interface UseAudioWarningsOptions {
  status: RecordingStatus
  transcripts: Transcript[]
}

export function useAudioWarnings({ status, transcripts }: UseAudioWarningsOptions) {
  const isRecording = status === RecordingStatus.RECORDING
  const recordingStartTime = useRef<number | null>(null)

  // Track which warnings have been shown this session
  const shownNoAudio = useRef(false)
  const shownNoSpeech = useRef(false)
  const shownSingleVoice = useRef(false)

  // Track audio activity
  const lastAudioActiveTime = useRef<number | null>(null)
  const transcriptCountAtStart = useRef(0)

  // Reset all state when recording starts
  useEffect(() => {
    if (isRecording) {
      recordingStartTime.current = Date.now()
      shownNoAudio.current = false
      shownNoSpeech.current = false
      shownSingleVoice.current = false
      lastAudioActiveTime.current = Date.now()
      transcriptCountAtStart.current = transcripts.length
    } else {
      recordingStartTime.current = null
    }
  }, [isRecording]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Warning 1: No audio detected ────────────────────────────────
  // Listen to audio-levels events from Tauri and track if any device is active
  useEffect(() => {
    if (!isRecording) return

    let unlisten: UnlistenFn | null = null
    let checkInterval: ReturnType<typeof setInterval> | null = null

    const setup = async () => {
      // Skip if not in Tauri
      if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return

      try {
        unlisten = await listen<AudioLevelUpdate>('audio-levels', (event) => {
          const anyActive = event.payload.levels.some(l => l.is_active)
          if (anyActive) {
            lastAudioActiveTime.current = Date.now()
          }
        })
      } catch {
        // Not in Tauri environment
        return
      }

      // Check periodically if we've gone too long without audio
      checkInterval = setInterval(() => {
        if (shownNoAudio.current || !recordingStartTime.current) return
        const elapsed = Date.now() - recordingStartTime.current
        if (elapsed < NO_AUDIO_THRESHOLD_MS) return

        const silenceDuration = Date.now() - (lastAudioActiveTime.current || recordingStartTime.current)
        if (silenceDuration >= NO_AUDIO_THRESHOLD_MS) {
          shownNoAudio.current = true
          toast.warning('No audio detected', {
            description: 'Check your microphone is connected and working.',
            duration: 15_000,
          })
        }
      }, 5_000)
    }

    setup()
    return () => {
      unlisten?.()
      if (checkInterval) clearInterval(checkInterval)
    }
  }, [isRecording])

  // ── Warning 2: No speech detected ───────────────────────────────
  // Check if any transcript segments have arrived since recording started
  useEffect(() => {
    if (!isRecording) return

    const checkInterval = setInterval(() => {
      if (shownNoSpeech.current || !recordingStartTime.current) return
      const elapsed = Date.now() - recordingStartTime.current
      if (elapsed < NO_SPEECH_THRESHOLD_MS) return

      const newTranscripts = transcripts.length - transcriptCountAtStart.current
      if (newTranscripts === 0) {
        shownNoSpeech.current = true
        toast.warning('No speech detected yet', {
          description: 'Is anyone talking? Check all participants can be heard.',
          duration: 15_000,
        })
      }
    }, 10_000)

    return () => clearInterval(checkInterval)
  }, [isRecording, transcripts.length])

  // ── Warning 3: Single voice (no turn-taking) ───────────────────
  // Analyse gaps between transcript segments — continuous speech with
  // no pauses suggests only one person is talking
  const checkTurnTaking = useCallback(() => {
    if (shownSingleVoice.current || !recordingStartTime.current) return
    const elapsed = Date.now() - recordingStartTime.current
    if (elapsed < SINGLE_VOICE_THRESHOLD_MS) return

    // Only look at transcripts from this recording session
    const sessionTranscripts = transcripts.slice(transcriptCountAtStart.current)
    if (sessionTranscripts.length < 5) return // Need enough data

    // Count gaps > TURN_GAP_SECONDS between consecutive segments
    let turnGaps = 0
    for (let i = 1; i < sessionTranscripts.length; i++) {
      const prev = sessionTranscripts[i - 1]
      const curr = sessionTranscripts[i]
      if (prev.audio_end_time != null && curr.audio_start_time != null) {
        const gap = curr.audio_start_time - prev.audio_end_time
        if (gap >= TURN_GAP_SECONDS) {
          turnGaps++
        }
      }
    }

    // If fewer than 2 turn gaps in 3+ minutes of recording, likely single voice
    if (turnGaps < 2) {
      shownSingleVoice.current = true
      toast.warning('Only one voice detected', {
        description: 'Check all meeting participants can be heard by the microphone.',
        duration: 15_000,
      })
    }
  }, [transcripts])

  useEffect(() => {
    if (!isRecording) return

    const checkInterval = setInterval(checkTurnTaking, 15_000)
    return () => clearInterval(checkInterval)
  }, [isRecording, checkTurnTaking])
}
