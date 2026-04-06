import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { OutcomeMode, Platform } from '../../../shared/types.js'

// ─── Provider configuration ───────────────────────────────────────────────────
// Set AI_PROVIDER in .env to switch between providers.
// Defaults to gemini. Supported: gemini | openai | anthropic

type Provider = 'gemini' | 'openai' | 'anthropic'

const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'gemini') as Provider
const AI_MODEL = process.env.AI_MODEL ?? defaultModel(AI_PROVIDER)

function defaultModel(provider: Provider): string {
  switch (provider) {
    case 'gemini':    return 'gemini-2.0-flash'
    case 'openai':    return 'gpt-4o'
    case 'anthropic': return 'claude-sonnet-4-5'
  }
}

// ─── Mode instructions ────────────────────────────────────────────────────────

const MODE_INSTRUCTIONS: Record<OutcomeMode, string> = {
  'knowledge':     'Extract key concepts, mental models, and insights.',
  'build-pack':    'Extract actionable steps, code snippets, repository links, and tools needed to build.',
  'decision-pack': 'Extract decision criteria, tradeoffs, rules of thumb, and conditions for choosing each option.',
  'coach-notes':   'Extract drills, technique cues, corrections, progressions, and performance rules.',
  'tools':         'Extract every tool, app, service, library, or resource mentioned — with a one-line description of each.',
  'stack':         'Extract the full tech stack: languages, frameworks, databases, hosting, and third-party services.',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractInput {
  text: string
  mode: OutcomeMode
  platform: Platform
  title?: string
}

interface ExtractOutput {
  title: string
  bullets: string[]
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function extractWithAI(input: ExtractInput): Promise<ExtractOutput> {
  const systemPrompt = buildSystemPrompt(input.mode)
  const userPrompt = buildUserPrompt(input)

  console.log(`[ai] provider=${AI_PROVIDER} model=${AI_MODEL} mode=${input.mode}`)

  let raw: string

  switch (AI_PROVIDER) {
    case 'gemini':
      raw = await extractWithGemini(systemPrompt, userPrompt)
      break
    case 'openai':
      raw = await extractWithOpenAI(systemPrompt, userPrompt)
      break
    case 'anthropic':
      raw = await extractWithAnthropic(systemPrompt, userPrompt)
      break
  }

  const bullets = parseBullets(raw)

  return {
    title: input.title ?? inferTitle(bullets),
    bullets,
  }
}

// ─── Provider implementations ─────────────────────────────────────────────────

async function extractWithGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')
  const model = genAI.getGenerativeModel({
    model: AI_MODEL,
    systemInstruction: systemPrompt,
  })
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
  })
  return result.response.text()
}

async function extractWithOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 1200,
  })
  return response.choices[0]?.message.content ?? ''
}

async function extractWithAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  const block = response.content[0]
  return block.type === 'text' ? block.text : ''
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(mode: OutcomeMode): string {
  return `You are a precision media intelligence engine. Your output is always structured bullet points — never prose, never introductions, never conclusions.

Rules:
- Bullet points only
- Maximum 2 sentences per bullet
- Sentence 1: the action, rule, or key insight
- Sentence 2 (optional): condition, warning, or why — only if it adds real value
- High signal only — no speculation, no filler, no generic observations
- Omit anything obvious or already implied

Task: ${MODE_INSTRUCTIONS[mode]}`
}

function buildUserPrompt(input: ExtractInput): string {
  return `Source: ${input.platform}${input.title ? ` — "${input.title}"` : ''}

Content:
${input.text}

Extract now.`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBullets(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length > 10)
}

function inferTitle(bullets: string[]): string {
  const first = bullets[0] ?? ''
  return first.length > 60 ? first.slice(0, 57) + '…' : first
}
