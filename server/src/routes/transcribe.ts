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

  if (typeof videoId !== 'string') {
    return res.status(400).json({ error: 'videoId required' })
  }

  const result = await fetchYouTubeTranscript(videoId)

  if (!result) {
    return res.status(404).json({ available: false })
  }

  res.json({ available: true, text: result.text, source: result.source })
})
