import type { LiveCaptureChunkMessage } from '@shared/types'

// Instagram Reels auto-captions are rendered in an absolutely-positioned overlay.
// Only activated on explicit user action.

let captionObserver: MutationObserver | null = null

function startLiveCapture() {
  if (captionObserver) return

  const selectors = [
    '[class*="Caption"]',
    'span[class*="caption"]',
  ]

  function findContainer() {
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

  const container = findContainer()
  if (container) {
    observe(container)
  } else {
    const waitObserver = new MutationObserver(() => {
      const c = findContainer()
      if (c) { waitObserver.disconnect(); observe(c) }
    })
    waitObserver.observe(document.body, { childList: true, subtree: true })
  }
}

function stopLiveCapture() {
  captionObserver?.disconnect()
  captionObserver = null
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_LIVE_CAPTURE') startLiveCapture()
  if (message.type === 'STOP_LIVE_CAPTURE') stopLiveCapture()
})
