import express from 'express'
import cors from 'cors'
import { extractRouter } from './routes/extract.js'
import { transcribeRouter } from './routes/transcribe.js'

const app = express()
const PORT = process.env.PORT ?? 3000

app.use(cors({ origin: '*' })) // Restrict to extension origin in production
app.use(express.json({ limit: '2mb' }))

app.use('/extract', extractRouter)
app.use('/transcribe', transcribeRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
