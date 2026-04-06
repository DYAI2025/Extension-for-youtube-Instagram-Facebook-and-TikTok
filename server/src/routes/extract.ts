import { Router } from 'express'
import { authMiddleware, type AuthRequest } from '../middleware/auth.js'
import { extractWithAI } from '../services/ai.js'
import { fetchYouTubeTranscript, joinCaptionChunks } from '../services/transcription.js'
import type { ExtractRequest } from '../../../shared/types.js'

export const extractRouter = Router()

extractRouter.use(authMiddleware)

// ─── Guest rate limiting ──────────────────────────────────────────────────────
const GUEST_LIMIT = 3
const GUEST_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours

interface GuestEntry { count: number; resetAt: number }
const guestCounts = new Map<string, GuestEntry>()

function getClientIp(req: AuthRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]) ?? req.socket.remoteAddress ?? 'unknown'
}

function checkGuestLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = guestCounts.get(ip)

  if (!entry || now > entry.resetAt) {
    guestCounts.set(ip, { count: 1, resetAt: now + GUEST_WINDOW_MS })
    return { allowed: true, remaining: GUEST_LIMIT - 1 }
  }

  if (entry.count >= GUEST_LIMIT) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: GUEST_LIMIT - entry.count }
}

extractRouter.post('/', async (req: AuthRequest, res) => {
  const body = req.body as ExtractRequest

  if (!body.url || !body.platform || !body.mode || !body.strategy) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Gate: enforce guest limit
  if (!req.userId) {
    const ip = getClientIp(req)
    const { allowed, remaining } = checkGuestLimit(ip)
    if (!allowed) {
      return res.status(429).json({
        error: 'Guest limit reached',
        message: `Free extractions used up. Sign in to continue.`,
        limit: GUEST_LIMIT,
      })
    }
    console.log(`[extract] Guest extraction from ${ip} — ${remaining} remaining today`)
  }

  let text: string

  if (body.strategy === 'instant') {
    // Try server-side transcript fetch first
    if (body.platform === 'youtube') {
      const videoId = extractYouTubeId(body.url)
      if (videoId) {
        const result = await fetchYouTubeTranscript(videoId)
        if (result) {
          text = result.text
        } else {
          // Fall back to transcript provided by content script
          text = body.transcript ?? body.metadata?.description ?? ''
        }
      } else {
        text = body.transcript ?? ''
      }
    } else {
      text = body.transcript ?? ''
    }
  } else {
    // Live: use accumulated caption chunks
    if (!body.captionChunks?.length) {
      return res.status(400).json({ error: 'No caption chunks provided for live extraction' })
    }
    const joined = joinCaptionChunks(body.captionChunks)
    text = joined.text
  }

  if (!text.trim()) {
    return res.status(422).json({ error: 'No extractable content found' })
  }

  const result = await extractWithAI({
    text,
    mode: body.mode,
    platform: body.platform,
    title: body.metadata?.title,
  })

  res.json(result)
})

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    return u.searchParams.get('v') ?? u.pathname.split('/').pop() ?? null
  } catch {
    return null
  }
}
