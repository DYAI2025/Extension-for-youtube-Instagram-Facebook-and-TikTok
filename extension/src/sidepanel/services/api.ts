/**
 * Side panel → background API client.
 * All server calls are proxied through the background service worker
 * (via chrome.runtime.sendMessage) so secrets stay out of the side panel.
 */

import type { OutcomeMode } from '@shared/types'

export function startExtraction(tabId: number, mode: OutcomeMode): void {
  chrome.runtime.sendMessage({ type: 'START_EXTRACTION', tabId, mode })
}

export function getCurrentPlatform(): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) { resolve(null); return }
      chrome.runtime.sendMessage({ type: 'GET_CURRENT_PLATFORM' }, resolve)
    })
  })
}
