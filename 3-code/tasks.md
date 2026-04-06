# Implementation Tasks

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Pending |
| 🔄 | In Progress |
| ✅ | Done |
| ❌ | Blocked |

## Priority Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 | Critical |
| 🟠 | High |
| 🟡 | Medium |
| 🟢 | Low |

## How to Update

When starting a task: change ⬜ → 🔄 and update `### Current State` in `CLAUDE.md`.  
When completing a task: change 🔄 → ✅ and update `### Current State` in `CLAUDE.md`.

---

## Task Table

### Setup & Infrastructure

| Task | Req | Priority | Status | Dependencies | Component |
|------|-----|----------|--------|--------------|-----------|

### Extension

| Task | Req | Priority | Status | Dependencies | Component |
|------|-----|----------|--------|--------------|-----------|
| Add extension icons (icon16, icon48, icon128) | — | 🟡 | ✅ | — | extension |
| Move API_BASE from hardcode to chrome.storage config | — | 🟠 | ✅ | — | extension |
| Create `sidepanel/services/` API client wrappers | — | 🟡 | ✅ | — | extension |

### Server

| Task | Req | Priority | Status | Dependencies | Component |
|------|-----|----------|--------|--------------|-----------|
| Implement `fetchYouTubeTranscript()` in transcription.ts | — | 🔴 | ✅ | Install youtube-transcript package | server |
| Implement guest rate limiting (Redis/DB counter by IP) | — | 🟠 | ✅ | — | server |

### Deploy & Operations

| Task | Req | Priority | Status | Dependencies | Component |
|------|-----|----------|--------|--------------|-----------|

---

## Execution Plan

### Phase 1 — Core Completion

**Goal**: Make extraction work end-to-end including YouTube transcripts.  
**Deployable state**: Extension can extract from YouTube via `instant` strategy using real transcripts.

Tasks in this phase:
1. Implement `fetchYouTubeTranscript()` (server)
2. Add extension icons (extension)
3. Move API_BASE to config (extension)

### Phase 2 — Reliability & Limits

**Goal**: Production-ready rate limiting and API client abstraction.  
**Deployable state**: Guest users are properly limited; API calls are cleanly abstracted.

Tasks in this phase:
1. Implement guest rate limiting (server)
2. Create `sidepanel/services/` API client wrappers (extension)
