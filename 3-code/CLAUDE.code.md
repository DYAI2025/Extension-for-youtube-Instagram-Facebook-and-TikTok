# Code Phase Instructions

This directory contains task tracking and component directories for the resource-extractor project.

## Phase Status

Code phase is active. Core scaffold is implemented. See `tasks.md` for pending tasks.

## Component Directories

| Directory | Component | Technology |
|-----------|-----------|------------|
| `extension/` | Chrome Extension | React + TypeScript + Vite (MV3) |
| `server/` | Backend API | Node.js + Express + TypeScript |
| `shared/` | Shared Types | TypeScript |

## Coding Conventions

- All shared TypeScript types live in `shared/types.ts` — never duplicate in extension or server
- Extension: import shared types via `@shared/*` path alias
- Server: import shared types via relative path `../../shared/types.js`
- Side effects (chrome APIs, fetch) belong in hooks and background worker — not React components
- No secrets in the extension — all AI/external calls go through the server
