import OpenAI from 'openai'
import { buildStockCountPrompt } from '../prompts'
import { extractJsonFromText, parseVisionModelOutput } from '../schema'
import type { ProviderResult, VisionImageInput } from '../types'

function getTextFromResponse(response: OpenAI.Responses.Response): string {
  if (response.output_text?.trim()) return response.output_text
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text?.trim()) return part.text
    }
  }
  throw new Error('OpenAI returned no text content')
}

export async function analyseWithOpenAI(input: VisionImageInput): Promise<ProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const model = process.env.OPENAI_MODEL?.trim()
  if (!apiKey || !model) throw new Error('OpenAI is not configured')

  const client = new OpenAI({ apiKey })
  const prompt = buildStockCountPrompt(input.instruction, input.images.length)
  const started = Date.now()

  const imageParts = input.images.map(image => ({
    type: 'input_image' as const,
    image_url: `data:${image.mediaType};base64,${image.base64}`,
    detail: 'high' as const,
  }))

  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'user',
        content: [
          ...imageParts,
          ...(input.images.length > 1
            ? [{
                type: 'input_text' as const,
                text: `Burst photos ${input.images.map(img => img.index).join(', ')} — analyse together.`,
              }]
            : []),
          { type: 'input_text', text: prompt },
        ],
      },
    ],
  })

  const text = getTextFromResponse(response)
  const parsed = parseVisionModelOutput(extractJsonFromText(text))

  return {
    provider: 'openai',
    model,
    output: parsed,
    latencyMs: Date.now() - started,
  }
}
