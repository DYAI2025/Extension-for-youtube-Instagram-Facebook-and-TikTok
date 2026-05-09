/**
 * Pure parsing helpers for YouTube description text.
 *
 * Kept side-effect free so they can be exercised from a test runner without
 * loading the chrome.* APIs or service worker globals.
 */

import type { DescriptionLink, TimestampedResource } from './types.js'

const URL_RE = /\b(https?:\/\/[^\s<>"'\)\]]+)/g
// Matches lines like "00:18 - ToolName ..." or "1:23:45 ToolName" — captures the
// timestamp and the rest of the line so URLs can be re-extracted from it.
const TIMESTAMP_LINE_RE = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—:]?\s*(.+)$/

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[\.,;:!\?\)\]\}>]+$/, '')
}

function normalizeUrl(raw: string): string {
  return trimTrailingPunctuation(raw.trim())
}

/**
 * Decode the `q` parameter from a `youtube.com/redirect?q=…` URL. YouTube
 * wraps every external link in a redirect that hides the real destination
 * behind URL-encoded text — feeding that wrapped URL directly to the user
 * (or to an LLM as "the canonical resource") produces broken/404 links.
 *
 * Returns the original input unchanged if it isn't a YouTube redirect.
 */
export function decodeYouTubeRedirect(url: string): string {
  if (!url) return url
  let parsed: URL
  try {
    parsed = new URL(url, 'https://www.youtube.com')
  } catch {
    return url
  }
  const host = parsed.hostname.replace(/^www\./, '')
  if (host !== 'youtube.com' && host !== 'm.youtube.com') return url
  if (parsed.pathname !== '/redirect') return url
  const target = parsed.searchParams.get('q')
  if (!target) return url
  try {
    return decodeURIComponent(target)
  } catch {
    return target
  }
}

/**
 * Resolve a list of raw description anchor `href` values into clean absolute
 * URLs: relative anchors become absolute against the YouTube origin and
 * `/redirect?q=…` wrappers are unwrapped. Drops in-page (`#`) and
 * `javascript:` anchors. Deduplicates while preserving first-seen order.
 */
export function resolveAnchorHrefs(hrefs: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of hrefs) {
    if (!raw) continue
    if (raw.startsWith('#') || raw.startsWith('javascript:')) continue
    let absolute: string
    try {
      absolute = new URL(raw, 'https://www.youtube.com').toString()
    } catch {
      continue
    }
    const decoded = decodeYouTubeRedirect(absolute)
    const normalized = normalizeUrl(decoded)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export function timestampToSeconds(ts: string): number | undefined {
  const parts = ts.split(':').map((p) => Number.parseInt(p, 10))
  if (parts.some((n) => Number.isNaN(n))) return undefined
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return undefined
}

/**
 * Extract URLs from arbitrary description text. Deduplicates while preserving
 * first-seen order.
 */
export function extractUrls(text: string): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of text.matchAll(URL_RE)) {
    const url = normalizeUrl(m[1])
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/**
 * Walk the description line by line, looking for timestamped chapter markers
 * (e.g. "00:18 - Topic name http://..."). Returns one TimestampedResource per
 * matching line, with optional URL.
 */
export function parseTimestampedResources(text: string): TimestampedResource[] {
  if (!text) return []
  const out: TimestampedResource[] = []
  const seen = new Set<string>()
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const m = TIMESTAMP_LINE_RE.exec(line)
    if (!m) continue
    const ts = m[1]
    const rest = m[2].trim()
    const urls = extractUrls(rest)
    const url = urls[0]
    const label = (url ? rest.replace(url, '').trim() : rest).replace(/^[-–—:\s]+|[-–—:\s]+$/g, '')
    const dedupeKey = `${ts}::${url ?? label}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push({
      timestamp: ts,
      timestamp_seconds: timestampToSeconds(ts),
      label: label || rest,
      ...(url ? { url } : {}),
    })
  }
  return out
}

/**
 * Build the canonical link list for the description: each URL appears at most
 * once. URLs that originated on a timestamp line carry that timestamp, with
 * the chapter label preferred as `title`.
 */
export function parseDescriptionLinks(text: string): DescriptionLink[] {
  if (!text) return []
  const links = new Map<string, DescriptionLink>()

  // 1. Timestamped lines first — they have richer metadata.
  for (const item of parseTimestampedResources(text)) {
    if (!item.url || links.has(item.url)) continue
    links.set(item.url, {
      url: item.url,
      timestamp: item.timestamp,
      ...(item.label ? { title: item.label } : {}),
    })
  }

  // 2. Raw URL scan picks up the rest, in document order.
  for (const url of extractUrls(text)) {
    if (links.has(url)) continue
    links.set(url, { url })
  }

  return [...links.values()]
}
