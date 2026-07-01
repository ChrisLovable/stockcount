import fs from 'fs'
import OpenAI from 'openai'

const env = fs.readFileSync('.env.local', 'utf8')
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^OPENAI_API_KEY=(.*)$/)
  if (!m) continue
  const raw = m[1]
  const trimmed = raw.trim()
  console.log('OPENAI_API_KEY found:', {
    length: raw.length,
    trimmedLength: trimmed.length,
    hasQuotes: /^["']/.test(raw),
    hasTrailingWhitespace: raw !== trimmed,
    prefix: trimmed.slice(0, 12),
  })

  const client = new OpenAI({ apiKey: trimmed })
  try {
    const models = await client.models.list({ limit: 1 })
    console.log('API key valid — models endpoint OK, count:', models.data.length)
  } catch (err) {
    console.log('API key rejected:', err.status, err.message?.slice(0, 120))
  }
  break
}
