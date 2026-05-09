import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeYouTubeRedirect,
  extractUrls,
  parseDescriptionLinks,
  parseTimestampedResources,
  resolveAnchorHrefs,
  timestampToSeconds,
} from '../../../shared/youtubeDescription.js'

const SAMPLE = `Welcome to my video! Here are the resources:

00:00 Intro https://example.com/intro
00:18 - Codex CLI: https://github.com/openai/codex
1:23:45 — Final tool https://github.com/example/tool

More links in the body:
https://github.com/openai/codex
https://supabase.com/docs

(See https://example.com/footer.)`

test('timestampToSeconds parses mm:ss and hh:mm:ss', () => {
  assert.equal(timestampToSeconds('00:18'), 18)
  assert.equal(timestampToSeconds('1:23'), 83)
  assert.equal(timestampToSeconds('1:23:45'), 5025)
  assert.equal(timestampToSeconds('not-a-ts'), undefined)
})

test('extractUrls dedupes and strips trailing punctuation', () => {
  const urls = extractUrls(SAMPLE)
  // example.com/footer is followed by ".)"; trailing ).  must be stripped.
  assert.ok(urls.includes('https://example.com/footer'), 'footer url must be cleaned')
  // The same Codex URL appears twice, only one entry expected.
  const codexHits = urls.filter((u) => u === 'https://github.com/openai/codex').length
  assert.equal(codexHits, 1)
})

test('parseTimestampedResources: matches every chapter line including hh:mm:ss', () => {
  const items = parseTimestampedResources(SAMPLE)
  assert.equal(items.length, 3)
  assert.equal(items[0].timestamp, '00:00')
  assert.equal(items[0].timestamp_seconds, 0)
  assert.equal(items[1].timestamp, '00:18')
  assert.equal(items[1].url, 'https://github.com/openai/codex')
  assert.equal(items[2].timestamp, '1:23:45')
  assert.equal(items[2].timestamp_seconds, 5025)
})

test('parseDescriptionLinks: timestamped lines win over plain URL scan and labels are kept', () => {
  const links = parseDescriptionLinks(SAMPLE)
  // 4 distinct URLs across the doc.
  const urls = links.map((l) => l.url)
  assert.deepEqual(new Set(urls), new Set([
    'https://example.com/intro',
    'https://github.com/openai/codex',
    'https://github.com/example/tool',
    'https://supabase.com/docs',
    'https://example.com/footer',
  ]))
  const codex = links.find((l) => l.url === 'https://github.com/openai/codex')
  assert.equal(codex?.timestamp, '00:18')
  assert.match(codex?.title ?? '', /Codex CLI/)
})

test('parseDescriptionLinks: no description → empty array', () => {
  assert.deepEqual(parseDescriptionLinks(''), [])
  assert.deepEqual(parseTimestampedResources(''), [])
})

test('decodeYouTubeRedirect: unwraps q-param URL', () => {
  const wrapped = 'https://www.youtube.com/redirect?event=video_description&redir_token=x&q=https%3A%2F%2Fgithub.com%2Fopenai%2Fcodex'
  assert.equal(decodeYouTubeRedirect(wrapped), 'https://github.com/openai/codex')
})

test('decodeYouTubeRedirect: leaves non-redirect URLs untouched', () => {
  assert.equal(decodeYouTubeRedirect('https://github.com/openai/codex'), 'https://github.com/openai/codex')
  assert.equal(decodeYouTubeRedirect(''), '')
  assert.equal(decodeYouTubeRedirect('not a url'), 'not a url')
})

test('resolveAnchorHrefs: decodes wrapped redirects, dedupes, drops junk', () => {
  const out = resolveAnchorHrefs([
    'https://www.youtube.com/redirect?q=https%3A%2F%2Fgithub.com%2Fopenai%2Fcodex',
    '/redirect?q=https%3A%2F%2Fgithub.com%2Fopenai%2Fcodex', // relative wrapped → same target
    'https://supabase.com/docs',
    '#section',
    'javascript:void(0)',
    '',
  ])
  assert.deepEqual(out, [
    'https://github.com/openai/codex',
    'https://supabase.com/docs',
  ])
})
