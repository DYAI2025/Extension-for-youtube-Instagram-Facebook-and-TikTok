import type { LiveCaptureChunkMessage } from '@shared/types'

// TikTok uses auto-generated captions rendered in a specific container.
// Capture is only started after an explicit user action (START_LIVE_CAPTURE).

let captureActive = false
let captionObserver: MutationObserver | null = null

function startLiveCapture() {
  if (captureActive) return
  captureActive = true

  // TikTok caption selectors — may need updates as TikTok changes its DOM
  const selectors = [
    '[class*="DivCaptionText"]',
    '[class*="caption-text"]',
    '[data-e2e="video-caption"]',
  ]

  function findCaptionContainer() {
    for (const sel of selectors) {
      const el = document.querySelector(sel)
      if (el) return el
    }
    return null
  }

  let lastText = ''

  function observe(container: Element) {
    captionObserver = new MutationObserver(() => {
      const text = container.textContent?.trim() ?? ''
      if (text && text !== lastText) {
        lastText = text
        const msg: LiveCaptureChunkMessage = {
          type: 'LIVE_CAPTURE_CHUNK',
          text,
          timestamp: Date.now(),
        }
        chrome.runtime.sendMessage(msg)
      }
    })
    captionObserver.observe(container, { childList: true, subtree: true, characterData: true })
  }

  const container = findCaptionContainer()
  if (container) {
    observe(container)
  } else {
    // Wait for captions to appear (user may not have enabled them yet)
    const waitObserver = new MutationObserver(() => {
      const c = findCaptionContainer()
      if (c) {
        waitObserver.disconnect()
        observe(c)
      }
    })
    waitObserver.observe(document.body, { childList: true, subtree: true })
  }
}

function stopLiveCapture() {
  captionObserver?.disconnect()
  captionObserver = null
  captureActive = false
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_LIVE_CAPTURE') startLiveCapture()
  if (message.type === 'STOP_LIVE_CAPTURE') stopLiveCapture()
})
