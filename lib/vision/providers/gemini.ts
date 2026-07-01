import { GoogleGenAI } from '@google/genai'
import { buildStockCountPrompt } from '../prompts'
import { extractJsonFromText, parseVisionModelOutput } from '../schema'
import type { ProviderResult, VisionImageInput } from '../types'

function getTextFromResponse(response: {
  text?: string
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}): string {
  if (response.text?.trim()) return response.text
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.text?.trim()) return part.text
    }
  }
  throw new Error('Gemini returned no text content')
}

export async function analyseWithGemini(input: VisionImageInput): Promise<ProviderResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  const model = process.env.GEMINI_MODEL?.trim()
  if (!apiKey || !model) throw new Error('Gemini is not configured')

  const ai = new GoogleGenAI({ apiKey })
  const prompt = buildStockCountPrompt(input.instruction, input.images.length)
  const started = Date.now()

  const parts = [
    ...input.images.map(image => ({
      inlineData: { mimeType: image.mediaType, data: image.base64 },
    })),
    ...(input.images.length > 1
      ? [{ text: `Burst photos ${input.images.map(img => img.index).join(', ')} — analyse together.` }]
      : []),
    { text: prompt },
  ]

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
  })

  const text = getTextFromResponse(response)
  const parsed = parseVisionModelOutput(extractJsonFromText(text))

  return {
    provider: 'gemini',
    model,
    output: parsed,
    latencyMs: Date.now() - started,
  }
}
