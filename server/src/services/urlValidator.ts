/**
 * URL liveness validation.
 *
 * For each Resource we run HEAD (fast) → fall back to a small GET when the
 * server doesn't support HEAD (405). Result is mapped to Resource.validation:
 *   'valid'      — final response status is 2xx
 *   'redirected' — followed one or more 3xx; final 2xx URL stored in final_url
 *   'invalid'    — terminal 4xx/5xx, DNS error, or refused connection
 *   'unchecked'  — timeout / network abort (we don't want to mark a maybe-live
 *                  resource as broken because the validator was too aggressive)
 *   'unverified' — repo-shaped GitHub URL that looks plausible but the
 *                  upstream API didn't confirm it (rate-limited, no token).
 *                  UI must render this with a visible "unverified" badge so
 *                  the user knows to double-check before trusting it.
 *
 * The check is best-effort: we cap concurrency and per-request timeout so it
 * never blocks an extraction by more than a few seconds total.
 */

import type { Resource } from '../../../shared/types.js'

const TIMEOUT_MS = 4000
const CONCURRENCY = 8

const USER_AGENT = 'Mozilla/5.0 (compatible; ExtractBot/0.1; +https://example.com/bot)'

export async function validateResources(resources: Resource[]): Promise<Resource[]> {
  if (resources.length === 0) return resources

  const queue = [...resources]
  const out: Resource[] = new Array(resources.length)
  const indexMap = new Map<Resource, number>()
  resources.forEach((r, i) => indexMap.set(r, i))

  async function worker() {
    while (queue.length > 0) {
      const r = queue.shift()
      if (!r) return
      const idx = indexMap.get(r)!
      const generic = await validateOne(r)
      out[idx] = await applyGitHubValidation(generic)
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, resources.length) }, () => worker())
  await Promise.all(workers)
  return out
}

async function validateOne(r: Resource): Promise<Resource> {
  // Trust empty / clearly broken URLs immediately
  if (!r.url || !/^https?:\/\//i.test(r.url)) {
    return { ...r, validation: 'invalid' }
  }

  // Try HEAD first (no body, fastest)
  const headRes = await fetchWithTimeout(r.url, { method: 'HEAD' })
  if (headRes.kind === 'response') {
    return classify(r, headRes.url, headRes.status, r.url)
  }

  // HEAD blocked / not allowed → tiny GET (Range: 0-1023) to confirm
  if (headRes.kind === 'method-not-allowed') {
    const getRes = await fetchWithTimeout(r.url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
    })
    if (getRes.kind === 'response') {
      return classify(r, getRes.url, getRes.status, r.url)
    }
    if (getRes.kind === 'invalid') {
      return { ...r, validation: 'invalid' }
    }
    return { ...r, validation: 'unchecked' }
  }

  if (headRes.kind === 'invalid') {
    return { ...r, validation: 'invalid' }
  }
  // Timeout / network glitch → we don't know, leave unchecked
  return { ...r, validation: 'unchecked' }
}

function classify(r: Resource, finalUrl: string, status: number, originalUrl: string): Resource {
  if (status >= 200 && status < 300) {
    if (finalUrl !== originalUrl) {
      return { ...r, validation: 'redirected', final_url: finalUrl }
    }
    return { ...r, validation: 'valid' }
  }
  if (status >= 300 && status < 400) {
    return { ...r, validation: 'redirected', final_url: finalUrl }
  }
  return { ...r, validation: 'invalid' }
}

type FetchResult =
  | { kind: 'response'; status: number; url: string }
  | { kind: 'invalid' }
  | { kind: 'timeout' }
  | { kind: 'method-not-allowed' }

/**
 * Cross-check GitHub repo URLs against the GitHub REST API. The HEAD/GET
 * liveness check is unreliable for github.com because GitHub returns 200 for
 * many invalid paths (it serves a "page not found" HTML body with HTTP 200
 * to logged-in browsers). Hitting `api.github.com/repos/{owner}/{repo}`
 * gives a clean 200/404 signal, so we use it as the source of truth for
 * GitHub repo links specifically.
 *
 * Behaviour:
 *  - 200 → keep `valid` / `redirected`
 *  - 404 → mark `invalid` (the URL leads to a real 404 page)
 *  - rate-limited (403/429) → mark `unverified` so the UI can warn the user
 *  - non-repo paths (gist, sponsors, etc.) → leave generic validation in place
 */
async function applyGitHubValidation(r: Resource): Promise<Resource> {
  const repo = parseGitHubRepoPath(r.url)
  if (!repo) return r

  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(apiUrl, { method: 'GET', headers, signal: ctrl.signal })
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 200) {
      // Trust the API: keep current validation (valid/redirected) — the URL is real.
      if (r.validation === 'invalid' || r.validation === 'unchecked') {
        return { ...r, validation: 'valid' }
      }
      return r
    }
    if (res.status === 404) {
      return { ...r, validation: 'invalid' }
    }
    if (res.status === 403 || res.status === 429) {
      // Rate-limited — we can't confirm. Surface to the user.
      return { ...r, validation: 'unverified' }
    }
    return r
  } catch {
    // Network issue → don't override; let generic validation stand.
    return r
  }
}

function parseGitHubRepoPath(url: string): { owner: string; repo: string } | null {
  if (!url) return null
  let u: URL
  try { u = new URL(url) } catch { return null }
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  if (host !== 'github.com') return null
  const segs = u.pathname.split('/').filter(Boolean)
  if (segs.length < 2) return null
  // Skip GitHub features that aren't user/repo: gist, sponsors, marketplace, topics, search, settings, orgs, etc.
  const reserved = new Set([
    'gist', 'sponsors', 'marketplace', 'topics', 'search', 'settings',
    'orgs', 'organizations', 'pricing', 'pulls', 'issues', 'notifications',
    'login', 'signup', 'about', 'security', 'features',
  ])
  if (reserved.has(segs[0].toLowerCase())) return null
  const owner = segs[0]
  const repo = segs[1].replace(/\.git$/, '')
  if (!owner || !repo) return null
  // GitHub doesn't allow dots/whitespace in usernames or trailing dashes; skip
  // anything that obviously isn't a real repo path.
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner)) return null
  if (!/^[A-Za-z0-9._-]+$/.test(repo)) return null
  return { owner, repo }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<FetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      ...init,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers as Record<string, string> | undefined ?? {}) },
    })
    if (res.status === 405 || res.status === 501) {
      return { kind: 'method-not-allowed' }
    }
    return { kind: 'response', status: res.status, url: res.url }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { kind: 'timeout' }
    // DNS failure / refused / TLS error → real signal that the URL is dead
    return { kind: 'invalid' }
  } finally {
    clearTimeout(timer)
  }
}
