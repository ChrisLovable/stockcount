import fs from 'fs'
import OpenAI from 'openai'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY?.trim() })
const model = env.OPENAI_MODEL?.trim()
console.log('Testing model:', model)

try {
  const response = await client.responses.create({
    model,
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'Say OK' }] }],
  })
  console.log('responses.create OK:', response.output_text?.slice(0, 50))
} catch (err) {
  console.log('responses.create failed:', err.status, err.code, err.message?.slice(0, 200))
}
