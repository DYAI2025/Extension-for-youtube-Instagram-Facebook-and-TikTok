import { Router } from 'express'
import { authMiddleware, type AuthRequest } from '../middleware/auth.js'
import { fetchYouTubeTranscript } from '../services/transcription.js'

export const transcribeRouter = Router()

transcribeRouter.use(authMiddleware)

/**
 * GET /transcribe/youtube?videoId=xxx
 * Returns the transcript for a YouTube video ID.
 * Used by the side panel to pre-check transcript availability.
 */
transcribeRouter.get('/youtube', async (req: AuthRequest, res) => {
  const { videoId } = req.query
  console.log('[EXTRACT-DEBUG] server/transcribe: route hit | videoId:', videoId)

  if (typeof videoId !== 'string') {
    console.warn('[EXTRACT-DEBUG] server/transcribe: 400 — videoId not a string')
    return res.status(400).json({ error: 'videoId required' })
  }

  const result = await fetchYouTubeTranscript(videoId)
  console.log('[EXTRACT-DEBUG] server/transcribe: fetchYouTubeTranscript done | available:', !!result, '| length:', result?.text?.length ?? 0, '| source:', result?.source)

  if (!result) {
    return res.status(404).json({ available: false })
  }

  res.json({ available: true, text: result.text, source: result.source })
})
