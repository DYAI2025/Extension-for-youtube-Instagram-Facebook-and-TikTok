import type { YouTubeSignal, YouTubeSignalMessage, VideoPausedMessage, VideoResumedMessage } from '@shared/types'

// ─── Caption accumulation (TextTrack API + DOM fallback) ──────────────────────

let captionText = ''
const attached = new WeakSet<HTMLVideoElement>()

function attachCaptionTracking(video: HTMLVideoElement) {
  // TextTrack API: works for YouTube auto-generated captions
  const attachTrack = (track: TextTrack) => {
    track.mode = 'hidden'
    track.addEventListener('cuechange', () => {
      if (!track.activeCues) return
      Array.from(track.activeCues).forEach((cue) => {
        const text = (cue as VTTCue).text?.replace(/<[^>]+>/g, '').trim()
        if (text && !captionText.endsWith(text)) {
          captionText += (captionText ? ' ' : '') + text
        }
      })
    })
    console.log('[yt-content] Attached TextTrack:', track.language, track.kind)
  }
  console.log('[yt-content] Video found, textTracks count:', video.textTracks.length)
  Array.from(video.textTracks).forEach(attachTrack)
  video.textTracks.addEventListener('addtrack', (e) => { if (e.track) attachTrack(e.track) })
}

// DOM fallback: watch .ytp-caption-segment for rendered caption text
let domCaptionText = ''
const domObserver = new MutationObserver(() => {
  const segments = document.querySelectorAll('.ytp-caption-segment')
  if (!segments.length) return
  const line = Array.from(segments).map(s => s.textContent ?? '').join(' ').trim()
  if (line && !domCaptionText.endsWith(line)) {
    domCaptionText += (domCaptionText ? ' ' : '') + line
  }
})
domObserver.observe(document.body, { childList: true, subtree: true })

// ─── FETCH_TRANSCRIPT handler ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FETCH_TRANSCRIPT') {
    const video = document.querySelector<HTMLVideoElement>('video')
    // Prefer TextTrack (more complete), fall back to DOM captures
    const transcript = captionText || domCaptionText
    console.log('[yt-content] FETCH_TRANSCRIPT called | TextTrack len:', captionText.length, '| DOM len:', domCaptionText.length, '| returning:', transcript.substring(0, 100))
    sendResponse({ transcript, currentTime: video?.currentTime ?? 0 })
    return true
  }
})

// ─── Signal detection ──────────────────────────────────────────────────────────

function buildSignal(video?: HTMLVideoElement | null): YouTubeSignal {
  const hasTranscript = !!document.querySelector('[aria-label="Show transcript"]')
  const descText = document.querySelector('#description-inline-expander, ytd-expander #content')?.textContent ?? ''
  return {
    hasTranscript,
    hasDescription: descText.trim().length > 80,
    hasChapters: document.querySelectorAll('.ytp-chapter-hover-container').length > 0,
    videoDurationSeconds: video?.duration ?? null,
    currentTime: video?.currentTime ?? 0,
  }
}

function sendSignal(video?: HTMLVideoElement | null) {
  const msg: YouTubeSignalMessage = { type: 'YOUTUBE_SIGNAL', signal: buildSignal(video) }
  chrome.runtime.sendMessage(msg).catch(() => {})
}

// ─── Pause / play detection ────────────────────────────────────────────────────

let pauseDebounce: ReturnType<typeof setTimeout> | null = null
let lastPauseTime = -1

function attachVideoListeners(video: HTMLVideoElement) {
  if (attached.has(video)) return
  attached.add(video)
  attachCaptionTracking(video)

  video.addEventListener('pause', () => {
    if (pauseDebounce) clearTimeout(pauseDebounce)
    pauseDebounce = setTimeout(() => {
      if (video.paused && !video.ended && video.currentTime !== lastPauseTime) {
        lastPauseTime = video.currentTime
        const msg: VideoPausedMessage = { type: 'VIDEO_PAUSED', currentTime: video.currentTime }
        chrome.runtime.sendMessage(msg).catch(() => {})
      }
    }, 600)
  })

  video.addEventListener('play', () => {
    if (pauseDebounce) { clearTimeout(pauseDebounce); pauseDebounce = null }
    const msg: VideoResumedMessage = { type: 'VIDEO_RESUMED' }
    chrome.runtime.sendMessage(msg).catch(() => {})
    sendSignal(video)
  })
}

// ─── Init ──────────────────────────────────────────────────────────────────────

function scanVideos() {
  document.querySelectorAll<HTMLVideoElement>('video').forEach((v) => {
    if (!v.dataset.extractListened) {
      v.dataset.extractListened = '1'
      attachVideoListeners(v)
      sendSignal(v)
    }
  })
}

scanVideos()
new MutationObserver(scanVideos).observe(document.body, { childList: true, subtree: true })
setTimeout(() => sendSignal(document.querySelector<HTMLVideoElement>('video')), 3000)

// ─── SPA navigation ────────────────────────────────────────────────────────────

window.addEventListener('yt-navigate-finish', () => {
  lastPauseTime = -1
  captionText = ''
  domCaptionText = ''
  chrome.runtime.sendMessage({ type: 'VIDEO_CHANGED', url: location.href, title: document.title }).catch(() => {})
  setTimeout(() => sendSignal(document.querySelector<HTMLVideoElement>('video')), 1500)
})
