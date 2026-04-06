/**
 * Transcription service.
 *
 * YouTube instant: use the youtube-transcript library to fetch the official
 * auto-generated or manual transcript via the video ID.
 *
 * Live (all platforms): caption chunks are accumulated by the content script
 * and passed directly — no transcription needed server-side.
 *
 * TODO: For YouTube live fallback, consider AssemblyAI or Whisper on audio.
 */

import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript'

export interface TranscriptResult {
  text: string
  source: 'youtube-api' | 'caption-chunks' | 'whisper'
}

/**
 * Fetch a YouTube transcript by video ID.
 * Returns null if transcript is unavailable.
 */
export async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptResult | null> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId)
    const text = segments.map((s) => s.text).join(' ')
    return { text, source: 'youtube-api' }
  } catch (err) {
    if (
      err instanceof YoutubeTranscriptDisabledError ||
      err instanceof YoutubeTranscriptNotAvailableError ||
      err instanceof YoutubeTranscriptVideoUnavailableError
    ) {
      return null
    }
    // Rate limit or unexpected error — log and fall back
    console.error(`[transcription] Failed to fetch transcript for ${videoId}:`, err)
    return null
  }
}

/**
 * Join accumulated live caption chunks into a single transcript string.
 */
export function joinCaptionChunks(chunks: string[]): TranscriptResult {
  // Deduplicate consecutive identical chunks (common in rolling captions)
  const deduped = chunks.filter((chunk, i) => chunk !== chunks[i - 1])
  return {
    text: deduped.join(' '),
    source: 'caption-chunks',
  }
}
