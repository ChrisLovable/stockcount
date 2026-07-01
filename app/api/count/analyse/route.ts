import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await request.formData()
    const image = form.get('image') as File | null
    const sessionId = form.get('sessionId') as string | null

    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

    const arrayBuffer = await image.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mediaType = (image.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

    // Upload to Supabase storage
    let imageUrl = ''
    const filename = `${user.id}/${Date.now()}-${image.name || 'capture.jpg'}`
    const { data: uploadData } = await supabase.storage
      .from('count-images')
      .upload(filename, image, { contentType: mediaType, upsert: false })

    if (uploadData) {
      const { data: urlData } = supabase.storage.from('count-images').getPublicUrl(filename)
      imageUrl = urlData.publicUrl
    }

    // Call Claude Vision
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
            {
              type: 'text',
              text: `You are a precise stock counting assistant.
Carefully examine this image and count every visible product unit on shelves or surfaces.

Return ONLY valid JSON:
{
  "items": [
    { "name": "product name", "count": 5, "confidence": "high" },
    { "name": "another product", "count": 3, "confidence": "medium" }
  ],
  "total_units": 8,
  "notes": "any observations about image quality or counting challenges"
}

Rules:
- Count each individual unit, not stacks
- If partially visible, include with low confidence
- Read labels to identify product names
- confidence must be: high, medium, or low`,
            },
          ],
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    const parsed = JSON.parse(jsonMatch[0])

    // Save to count_images table
    if (sessionId) {
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
