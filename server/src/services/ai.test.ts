import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseV2 } from './ai.js'
import type { OutcomeMode, Platform } from '../../../shared/types.js'

const baseInput = {
  mode: 'knowledge' as OutcomeMode,
  platform: 'youtube' as Platform,
  text: 'mock transcript covering topic A at the beginning, topic B in the middle, and topic C near the end. We mention https://example.com/a, https://example.com/b, https://example.com/c, https://example.com/unrelated.',
  extractionScope: 'full_video' as const,
}

function fixture(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    title: 'Three Topics',
    summary: 'A demo video that covers three topics across its full length.',
    video_explanation: 'Walks through topic A, B, then C.',
    key_takeaways: [
      'Topic A insight from the beginning of the video.',
      'Topic B insight from the middle of the video.',
      'Topic C insight from the end of the video.',
    ],
    sections: [
      {
        title: 'Topic A intro',
        summary: 'Sets up topic A and why it matters.',
        key_points: ['A point 1', 'A point 2'],
        semantic_keywords: ['alpha', 'foundation', 'setup'],
        timestamp_seconds: 30,
        related_links: [
          { title: 'A docs', url: 'https://example.com/a', why_relevant_here: 'Reference for topic A.', confidence: 'high' },
        ],
      },
      {
        title: 'Topic B deep dive',
        summary: 'Goes deeper into topic B.',
        key_points: ['B point 1', 'B point 2'],
        semantic_keywords: ['beta', 'core'],
        timestamp_seconds: 900,
        related_links: [
          { title: 'B repo', url: 'https://example.com/b', why_relevant_here: 'Reference implementation for topic B.', confidence: 'high' },
        ],
      },
      {
        title: 'Topic C outro',
        summary: 'Wraps up with topic C.',
        key_points: ['C point 1'],
        semantic_keywords: ['gamma', 'wrapup'],
        timestamp_seconds: 2700,
        related_links: [
          { title: 'C tool', url: 'https://example.com/c', why_relevant_here: 'Tool used to ship topic C.', confidence: 'medium' },
        ],
      },
    ],
    resources: [
      { title: 'A docs', url: 'https://example.com/a', type: 'docs', mentioned_in_video: true, mentioned_context: 'topic A', why_relevant: 'Reference for A.', user_action: 'Read.', confidence: 'high' },
      { title: 'B repo', url: 'https://example.com/b', type: 'repo', mentioned_in_video: true, mentioned_context: 'topic B', why_relevant: 'Reference for B.', user_action: 'Star.', confidence: 'high' },
      { title: 'C tool', url: 'https://example.com/c', type: 'tool', mentioned_in_video: true, mentioned_context: 'topic C', why_relevant: 'Tool for C.', user_action: 'Try.', confidence: 'medium' },
      { title: 'Unrelated', url: 'https://example.com/unrelated', type: 'other', mentioned_in_video: false, why_relevant: 'Side mention.', user_action: 'Browse.', confidence: 'low' },
    ],
    setup_guide: { exists: false },
    warnings: [],
    source_coverage: {
      transcript_available: true,
      extraction_source: 'transcript',
      confidence: 'high',
    },
    ...overrides,
  })
}

test('parseV2: produces sections covering beginning, middle and end', () => {
  const v2 = parseV2(fixture(), baseInput)
  assert.equal(v2.sections.length, 3)
  assert.equal(v2.sections[0].title, 'Topic A intro')
  assert.equal(v2.sections[1].title, 'Topic B deep dive')
  assert.equal(v2.sections[2].title, 'Topic C outro')
  // Timestamps must increase monotonically across the timeline.
  const ts = v2.sections.map((s) => s.timestamp_seconds ?? 0)
  assert.ok(ts[0] < ts[1] && ts[1] < ts[2], 'section timestamps should span the full video')
})

test('parseV2: assigns related links into the matching topic block', () => {
  const v2 = parseV2(fixture(), baseInput)
  const topicB = v2.sections[1]
  assert.ok(topicB.related_links && topicB.related_links.length === 1)
  assert.equal(topicB.related_links?.[0].url, 'https://example.com/b')
})

test('parseV2: surfaces unrelated link in unassigned_resources', () => {
  const v2 = parseV2(fixture(), baseInput)
  const urls = (v2.unassigned_resources ?? []).map((r) => r.url)
  assert.deepEqual(urls, ['https://example.com/unrelated'])
})

test('parseV2: source_coverage.extraction_scope is full_video when input scope is full_video', () => {
  const v2 = parseV2(fixture(), baseInput)
  assert.equal(v2.source_coverage.extraction_scope, 'full_video')
  assert.equal(v2.source_coverage.transcript_available, true)
})

test('parseV2: drops attached link whose url is not in resources[]', () => {
  const v2 = parseV2(
    fixture({
      sections: [
        {
          title: 'Topic A intro',
          summary: 'Sets up topic A.',
          key_points: ['A point 1'],
          semantic_keywords: ['alpha'],
          related_links: [
            { title: 'Hallucinated', url: 'https://example.com/not-in-resources', why_relevant_here: 'Made up.', confidence: 'high' },
          ],
        },
      ],
    }),
    baseInput,
  )
  assert.equal(v2.sections.length, 1)
  assert.equal(v2.sections[0].related_links?.length ?? 0, 0)
})

test('parseV2: ingests semantic_keywords on each section', () => {
  const v2 = parseV2(fixture(), baseInput)
  assert.deepEqual(v2.sections[0].semantic_keywords, ['alpha', 'foundation', 'setup'])
  assert.deepEqual(v2.sections[1].semantic_keywords, ['beta', 'core'])
})

// ─── YouTube description back-fill ───────────────────────────────────────────

const ytBundleInput = {
  ...baseInput,
  youtubeSource: {
    videoId: 'abc123',
    videoUrl: 'https://www.youtube.com/watch?v=abc123',
    title: 'Three Topics',
    transcriptText: baseInput.text,
    transcriptAvailable: true,
    descriptionText:
      '00:00 Intro\n00:18 Tool D https://example.com/d\nMore: https://example.com/e',
    descriptionAvailable: true,
    descriptionLinks: [
      { url: 'https://example.com/d', timestamp: '00:18', title: 'Tool D' },
      { url: 'https://example.com/e' },
    ],
    timestampedResources: [
      { timestamp: '00:00', timestamp_seconds: 0, label: 'Intro' },
      { timestamp: '00:18', timestamp_seconds: 18, label: 'Tool D', url: 'https://example.com/d' },
    ],
    extractionSourceCoverage: ['transcript' as const, 'description' as const],
  },
}

test('parseV2 + youtubeSource: back-fills missing description URLs into resources[]', () => {
  const v2 = parseV2(fixture(), ytBundleInput)
  const urls = v2.resources.map((r) => r.url)
  assert.ok(urls.includes('https://example.com/d'), 'd must be back-filled from description')
  assert.ok(urls.includes('https://example.com/e'), 'e must be back-filled from description')
  const d = v2.resources.find((r) => r.url === 'https://example.com/d')
  assert.equal(d?.mentioned_in_video, true)
  assert.match(d?.mentioned_context ?? '', /00:18/)
})

test('parseV2 + youtubeSource: source_coverage carries description counters', () => {
  const v2 = parseV2(fixture(), ytBundleInput)
  assert.equal(v2.source_coverage.description_available, true)
  assert.equal(v2.source_coverage.description_link_count, 2)
  assert.equal(v2.source_coverage.timestamped_resource_count, 2)
})

test('parseV2 + youtubeSource: propagates timestamp + source onto attached link', () => {
  const fix = JSON.parse(fixture())
  // Inject a section whose related_links contains the description URL without timestamp/source.
  fix.sections.push({
    title: 'Topic D extras',
    summary: 'Mentions tool D.',
    key_points: ['Use tool D'],
    semantic_keywords: ['delta'],
    related_links: [
      {
        title: 'Tool D',
        url: 'https://example.com/d',
        why_relevant_here: 'Used for D in this section.',
        confidence: 'high',
      },
    ],
  })
  const v2 = parseV2(JSON.stringify(fix), ytBundleInput)
  const newSection = v2.sections.find((s) => s.title === 'Topic D extras')
  const link = newSection?.related_links?.[0]
  assert.equal(link?.timestamp, '00:18')
  assert.equal(link?.source, 'youtube_description_timestamp')
})
