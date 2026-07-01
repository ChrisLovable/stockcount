import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildPrompt(instruction: string): string {
  const countingFocus = instruction.trim()
    ? `SPECIFIC INSTRUCTION FROM USER: "${instruction.trim()}"
Focus your counting on exactly what the user asked for.
Only count what matches the instruction.`
    : `Count all visible product units on shelves or surfaces.`

  return `You are a precise AI counting assistant.
${countingFocus}

Examine this image carefully and count what was requested.

Return ONLY valid JSON:
{
  "items": [
    { "name": "descriptive name of what was counted", "count": 5, "confidence": "high" }
  ],
  "total_units": 5,
  "notes": "any observations about the image or counting challenges"
}

Rules:
- Count ONLY what matches the user instruction
- Be precise — count each individual item
- If partially visible, include with low confidence
- confidence must be: high, medium, or low
- name should describe what was counted based on the instruction`
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let base64: string
    let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg'
    let sessionId: string | null = null
    let instruction = ''
    let imageUrl = ''

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      // Video frame path: base64 data sent as JSON
      const body = await request.json().catch(() => null)
      if (!body?.base64) return NextResponse.json({ error: 'No image data provided' }, { status: 400 })

      base64 = (body.base64 as string).replace(/^data:image\/\w+;base64,/, '')
      sessionId = body.sessionId ?? null
      instruction = (body.instruction as string) || ''
      // Skip storage upload for individual video frames
    } else {
      // Photo/upload path: multipart form data
      const form = await request.formData()
      const image = form.get('image') as File | null
      sessionId = form.get('sessionId') as string | null
      instruction = (form.get('instruction') as string) || ''

      if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

      const arrayBuffer = await image.arrayBuffer()
      base64 = Buffer.from(arrayBuffer).toString('base64')
      mediaType = (image.type || 'image/jpeg') as typeof mediaType

      // Upload to Supabase storage
      const filename = `${user.id}/${Date.now()}-${image.name || 'capture.jpg'}`
      const { data: uploadData } = await supabase.storage
        .from('count-images')
        .upload(filename, image, { contentType: mediaType, upsert: false })

      if (uploadData) {
        const { data: urlData } = supabase.storage.from('count-images').getPublicUrl(filename)
        imageUrl = urlData.publicUrl
      }
    }

    // Call Claude Vision with dynamic prompt
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: buildPrompt(instruction) },
          ],
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    const parsed = JSON.parse(jsonMatch[0])

    // Persist to count_images for photo captures only (not video frames)
    if (sessionId && imageUrl) {
      await supabase.from('count_images').insert({
        session_id: sessionId,
        user_id: user.id,
        image_url: imageUrl,
        ai_response: parsed,
      })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('Analyse error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Analysis failed' }, { status: 500 })
  }
}
