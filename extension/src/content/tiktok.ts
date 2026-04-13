import type { VideoPausedMessage, VideoResumedMessage } from '@shared/types'

const attached = new WeakSet<HTMLVideoElement>()
const pauseDebounces = new WeakMap<HTMLVideoElement, ReturnType<typeof setTimeout>>()

// ─── Caption accumulation ─────────────────────────────────────────────────────

let captionText = ''

function attachCaptionTracking(video: HTMLVideoElement) {
  const attachTrack = (track: TextTrack) => {
    track.mode = 'hidden'  // ensure cues fire even if not visually shown
    track.addEventListener('cuechange', () => {
      if (!track.activeCues) return
      Array.from(track.activeCues).forEach((cue) => {
        const text = (cue as VTTCue).text?.replace(/<[^>]+>/g, '').trim()
        if (text && !captionText.endsWith(text)) {
          captionText += (captionText ? ' ' : '') + text
        }
      })
    })
  }
  Array.from(video.textTracks).forEach(attachTrack)
  video.textTracks.addEventListener('addtrack', (e) => { if (e.track) attachTrack(e.track) })
}

// ─── FETCH_TRANSCRIPT handler ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'FETCH_TRANSCRIPT') {
    const video = document.querySelector<HTMLVideoElement>('video')
    sendResponse({ transcript: captionText, currentTime: video?.currentTime ?? 0 })
    return true
  }
})

// ─── URL change → VIDEO_CHANGED ───────────────────────────────────────────────

let lastUrl = location.href
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href
    captionText = ''
    chrome.runtime.sendMessage({ type: 'VIDEO_CHANGED', url: location.href, title: document.title }).catch(() => {})
  }
}).observe(document.body, { childList: true, subtree: true })

// ─── Video event listeners ────────────────────────────────────────────────────

function attachVideo(video: HTMLVideoElement) {
  if (attached.has(video)) return
  attached.add(video)
  attachCaptionTracking(video)

  if (!video.paused && !video.ended) {
    const msg: VideoResumedMessage = { type: 'VIDEO_RESUMED' }
    chrome.runtime.sendMessage(msg).catch(() => {})
  }

  video.addEventListener('pause', () => {
    const existing = pauseDebounces.get(video)
    if (existing) clearTimeout(existing)
    pauseDebounces.set(video, setTimeout(() => {
      if (video.paused && !video.ended) {
        const msg: VideoPausedMessage = { type: 'VIDEO_PAUSED', currentTime: video.currentTime }
        chrome.runtime.sendMessage(msg).catch(() => {})
      }
    }, 600))
  })

  video.addEventListener('play', () => {
    const existing = pauseDebounces.get(video)
    if (existing) { clearTimeout(existing); pauseDebounces.delete(video) }
    const msg: VideoResumedMessage = { type: 'VIDEO_RESUMED' }
    chrome.runtime.sendMessage(msg).catch(() => {})
  })

  video.addEventListener('ended', () => {
    const existing = pauseDebounces.get(video)
    if (existing) { clearTimeout(existing); pauseDebounces.delete(video) }
    const msg: VideoPausedMessage = { type: 'VIDEO_PAUSED', currentTime: video.currentTime }
    chrome.runtime.sendMessage(msg).catch(() => {})
  })
}

function scanVideos() {
  document.querySelectorAll<HTMLVideoElement>('video').forEach(attachVideo)
}

scanVideos()
const observer = new MutationObserver(scanVideos)
observer.observe(document.body, { childList: true, subtree: true })
