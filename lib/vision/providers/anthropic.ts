import Anthropic from '@anthropic-ai/sdk'
import { buildStockCountPrompt } from '../prompts'
import { extractJsonFromText, parseVisionModelOutput } from '../schema'
import type { ProviderResult, VisionImageInput } from '../types'

function getTextFromResponse(content: Anthropic.Messages.ContentBlock[]): string {
  const block = content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Anthropic returned no text content')
  return block.text
}

function buildImageContent(input: VisionImageInput) {
  const blocks: Anthropic.Messages.ContentBlockParam[] = []

  for (const image of input.images) {
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
    })
  }

  if (input.images.length > 1) {
    blocks.push({
      type: 'text',
      text: `Burst photos ${input.images.map(img => img.index).join(', ')} (use all together).`,
    })
  }

  return blocks
}

export async function analyseWithAnthropic(
  input: VisionImageInput,
  options?: { prompt?: string; label?: string; textOnly?: boolean },
): Promise<ProviderResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  const model = process.env.ANTHROPIC_MODEL?.trim()
  if (!apiKey || !model) throw new Error('Anthropic is not configured')

  const client = new Anthropic({ apiKey })
  const prompt =
    options?.prompt ??
    buildStockCountPrompt(input.instruction, input.images.length)
  const started = Date.now()

  const content: Anthropic.Messages.ContentBlockParam[] = options?.textOnly
    ? [{ type: 'text', text: prompt }]
    : [...buildImageContent(input), { type: 'text', text: prompt }]

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content }],
  })

  const text = getTextFromResponse(response.content)
  const parsed = parseVisionModelOutput(extractJsonFromText(text))

  return {
    provider: options?.label === 'arbiter' ? 'arbiter' : 'anthropic',
    model,
    output: parsed,
    latencyMs: Date.now() - started,
  }
}
