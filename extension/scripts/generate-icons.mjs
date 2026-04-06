/**
 * Pure Node.js icon generator — no dependencies.
 * Produces icon16.png, icon48.png, icon128.png in extension/public/.
 *
 * Design: dark #0F0F1A rounded-square + white lightning bolt.
 * Run: node scripts/generate-icons.mjs
 */

import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public')
mkdirSync(outDir, { recursive: true })

// ─── PNG encoder ─────────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[i] = c
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const d = Buffer.from(data)
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length)
  const crcBuf = Buffer.concat([t, d])
  const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf))
  return Buffer.concat([len, t, d, crcVal])
}

function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6 // RGBA
  // filter byte (0=None) + row data
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ─── Rasterizer ──────────────────────────────────────────────────────────────

/** Is pixel (px, py) inside a rounded rect of size S with corner radius rx? */
function inRoundedRect(px, py, S, rx) {
  if (px < 0 || py < 0 || px >= S || py >= S) return false
  const cx = Math.min(Math.max(px, rx), S - 1 - rx)
  const cy = Math.min(Math.max(py, rx), S - 1 - rx)
  return (px - cx) ** 2 + (py - cy) ** 2 <= rx ** 2
}

/**
 * Point-in-polygon via ray casting (even-odd rule).
 * poly: array of [x, y] vertices in polygon coordinate space (0..1 normalized).
 */
function inPolygon(px, py, poly) {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// ─── Icon design ─────────────────────────────────────────────────────────────

// Background: #0F0F1A
const BG = [15, 15, 26, 255]
// Bolt: white with slight warm tint
const BOLT = [255, 255, 255, 245]
// Transparent
const CLEAR = [0, 0, 0, 0]

/**
 * Lightning bolt polygon — defined in 0..1 normalized space.
 * Derived from 128x128 path: M73,14 L43,63 L62,63 L57,114 L87,65 L68,65 Z
 */
const BOLT_POLY = [
  [73 / 128, 14 / 128],
  [43 / 128, 63 / 128],
  [62 / 128, 63 / 128],
  [57 / 128, 114 / 128],
  [87 / 128, 65 / 128],
  [68 / 128, 65 / 128],
]

function renderIcon(size) {
  const rx = size <= 16 ? 3 : size <= 48 ? 9 : 24
  const rgba = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4

      if (!inRoundedRect(x, y, size, rx)) {
        // Outside rounded rect → transparent
        rgba[idx] = CLEAR[0]; rgba[idx + 1] = CLEAR[1]
        rgba[idx + 2] = CLEAR[2]; rgba[idx + 3] = CLEAR[3]
        continue
      }

      // Use pixel center for polygon test (normalized)
      const nx = (x + 0.5) / size
      const ny = (y + 0.5) / size

      const color = inPolygon(nx, ny, BOLT_POLY) ? BOLT : BG
      rgba[idx] = color[0]; rgba[idx + 1] = color[1]
      rgba[idx + 2] = color[2]; rgba[idx + 3] = color[3]
    }
  }

  return encodePNG(size, size, rgba)
}

// ─── Generate ─────────────────────────────────────────────────────────────────

for (const size of [16, 48, 128]) {
  const png = renderIcon(size)
  const out = join(outDir, `icon${size}.png`)
  writeFileSync(out, png)
  console.log(`✓ icon${size}.png  (${png.length} bytes)`)
}

console.log('Done → extension/public/')
