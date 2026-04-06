import type {
  Platform,
  ExtractionStrategy,
  YouTubeSignal,
  SignalStrength,
  PlatformDetectedMessage,
  YouTubeSignalMessage,
  LiveCaptureChunkMessage,
  ExtractRequest,
} from '@shared/types'

// ─── Platform detection ───────────────────────────────────────────────────────

function detectPlatform(url: string): Platform {
  try {
    const { hostname } = new URL(url)
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube'
    if (hostname.includes('tiktok.com')) return 'tiktok'
    if (hostname.includes('instagram.com')) return 'instagram'
    if (hostname.includes('facebook.com')) return 'facebook'
  } catch {
    // ignore invalid URLs
  }
  return 'unknown'
}

function scoreYouTubeSignal(signal: YouTubeSignal): SignalStrength {
  const score =
    (signal.hasTranscript ? 3 : 0) +
    (signal.hasDescription ? 1 : 0) +
    (signal.hasChapters ? 1 : 0)
  return score >= 3 ? 'strong' : 'weak'
}

function resolveStrategy(platform: Platform, signal?: YouTubeSignal): ExtractionStrategy {
  if (platform !== 'youtube') return 'live'
  if (!signal) return 'live'
  return scoreYouTubeSignal(signal) === 'strong' ? 'instant' : 'live'
}

// ─── State ────────────────────────────────────────────────────────────────────

interface TabState {
  platform: Platform
  url: string
  title: string
  signal?: YouTubeSignal
  strategy: ExtractionStrategy
  captionChunks: string[]
}

const tabStates = new Map<number, TabState>()

// ─── Open side panel on action click ─────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  if (tab.id == null) return
  chrome.sidePanel.open({ tabId: tab.id })
})

// ─── Tab monitoring ───────────────────────────────────────────────────────────

async function handleTabChange(tabId: number, url: string, title: string) {
  const platform = detectPlatform(url)

  const state: TabState = {
    platform,
    url,
    title,
    strategy: resolveStrategy(platform),
    captionChunks: [],
  }
  tabStates.set(tabId, state)

  // For non-YouTube platforms we immediately broadcast (no signal needed)
  if (platform !== 'youtube') {
    broadcastPlatformDetected(tabId, state)
    return
  }

  // YouTube: wait for signal from content script (see onMessage handler below)
  // Broadcast an initial "detecting" state so the side panel knows we're working
  broadcastPlatformDetected(tabId, state)
}

function broadcastPlatformDetected(_tabId: number, state: TabState) {
  const msg: PlatformDetectedMessage = {
    type: 'PLATFORM_DETECTED',
    platform: state.platform,
    url: state.url,
    title: state.title,
    strategy: state.strategy,
    signal: state.signal,
  }
  // Send to side panel (may not be open yet — ignore errors)
  chrome.runtime.sendMessage(msg).catch(() => {})
}

// ─── Listen for tab updates ───────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  if (!tab.url || !tab.title) return
  handleTabChange(tabId, tab.url, tab.title)
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url || !tab.title) return
  handleTabChange(tabId, tab.url, tab.title)
})

// ─── Messages from content scripts ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id
  if (tabId == null) return

  if (message.type === 'YOUTUBE_SIGNAL') {
    const msg = message as YouTubeSignalMessage
    const state = tabStates.get(tabId)
    if (!state) return

    state.signal = msg.signal
    state.strategy = resolveStrategy('youtube', msg.signal)
    tabStates.set(tabId, state)
    broadcastPlatformDetected(tabId, state)
  }

  if (message.type === 'LIVE_CAPTURE_CHUNK') {
    const msg = message as LiveCaptureChunkMessage
    const state = tabStates.get(tabId)
    if (!state) return
    state.captionChunks.push(msg.text)
    tabStates.set(tabId, state)
  }
})

// ─── Messages from side panel ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_PLATFORM') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) { sendResponse(null); return }
      const state = tabStates.get(tab.id)
      sendResponse(state ?? null)
    })
    return true // async response
  }

  if (message.type === 'START_EXTRACTION') {
    handleStartExtraction(message.tabId, message.mode)
  }
})

// ─── Extraction orchestration ─────────────────────────────────────────────────

async function handleStartExtraction(tabId: number, mode: string) {
  const state = tabStates.get(tabId)
  if (!state || state.platform === 'unknown') return

  const API_BASE = import.meta.env.VITE_API_BASE as string

  const body: ExtractRequest = {
    url: state.url,
    platform: state.platform,
    mode: mode as ExtractRequest['mode'],
    strategy: state.strategy,
    captionChunks: state.strategy === 'live' ? state.captionChunks : undefined,
  }

  chrome.runtime.sendMessage({
    type: 'EXTRACTION_PROGRESS',
    percent: 10,
    statusText: 'Sending to extraction engine…',
  }).catch(() => {})

  try {
    const session = await getSupabaseSession()
    const res = await fetch(`${API_BASE}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session}` } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const message = errBody.message ?? errBody.error ?? `Server error: ${res.status}`
      throw new Error(message)
    }

    const data = await res.json()

    chrome.runtime.sendMessage({
      type: 'EXTRACTION_COMPLETE',
      pack: {
        id: crypto.randomUUID(),
        userId: '',
        title: data.title,
        url: state.url,
        platform: state.platform,
        mode: mode,
        bullets: data.bullets,
        savedAt: new Date().toISOString(),
      },
    }).catch(() => {})
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'EXTRACTION_ERROR',
      message: err instanceof Error ? err.message : 'Unknown error',
    }).catch(() => {})
  }
}

async function getSupabaseSession(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['supabase_token'], (result) => {
      resolve(result.supabase_token ?? null)
    })
  })
}
