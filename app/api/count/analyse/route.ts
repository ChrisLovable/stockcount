import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { VisionPrepMode } from '@/lib/images/prepareForVision'
import { runVisionConsensus } from '@/lib/vision/consensus'
import { defaultVisionMode, prepareImages } from '@/lib/vision/prepareImages'
import type { StoredCountAnalysis } from '@/lib/vision/types'

function stripBase64(data: string): string {
  return data.replace(/^data:image\/\w+;base64,/, '')
}

function parseVisionMode(value: unknown, burstMode: boolean): VisionPrepMode {
  if (value === 'fast' || value === 'deep' || value === 'default') return value
  return defaultVisionMode(burstMode)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let rawImages: string[] = []
    let sessionId: string | null = null
    let instruction = ''
    let burstMode = false
    let visionMode: VisionPrepMode = 'deep'

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => null)
      if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

      sessionId = body.sessionId ?? null
      instruction = (body.instruction as string) || ''
      burstMode = Boolean(body.burst)

      if (Array.isArray(body.images) && body.images.length > 0) {
        rawImages = body.images.map((img: string) => stripBase64(img))
        burstMode = burstMode || body.images.length > 1
      } else if (body.base64) {
        rawImages = [stripBase64(body.base64 as string)]
      } else {
        return NextResponse.json({ error: 'No image data provided' }, { status: 400 })
      }

      visionMode = parseVisionMode(body.visionMode, burstMode)
    } else {
      const form = await request.formData()
      sessionId = form.get('sessionId') as string | null
      instruction = (form.get('instruction') as string) || ''
      burstMode = form.get('burst') === 'true'

      const burstFiles = form.getAll('images') as File[]
      const singleImage = form.get('image') as File | null

      if (burstFiles.length > 0) {
        burstMode = true
        for (const file of burstFiles) {
          const arrayBuffer = await file.arrayBuffer()
          rawImages.push(Buffer.from(arrayBuffer).toString('base64'))
        }
      } else if (singleImage) {
        const arrayBuffer = await singleImage.arrayBuffer()
        rawImages = [Buffer.from(arrayBuffer).toString('base64')]
      } else {
        return NextResponse.json({ error: 'No image provided' }, { status: 400 })
      }

      visionMode = parseVisionMode(form.get('visionMode'), burstMode)
    }

    if (rawImages.length === 0) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 })
    }

    const preparedImages = await prepareImages(rawImages, visionMode)

    const consensus = await runVisionConsensus({
      images: preparedImages,
      instruction,
      burstMode: burstMode || preparedImages.length > 1,
    })

    const imagesUsed: string[] = []
    const originalImages: string[] = []
    const imagePrepLogs = preparedImages.map(img => img.prepLog)
    let countImageId: string | null = null

    if (sessionId) {
      const timestamp = Date.now()
      for (const image of preparedImages) {
        if (image.originalBuffer) {
          const originalName = `${user.id}/${timestamp}-original-${image.index}.bin`
          const { data: originalUpload } = await supabase.storage
            .from('count-images')
            .upload(originalName, image.originalBuffer, {
              contentType: 'application/octet-stream',
              upsert: false,
            })
          if (originalUpload) {
            const { data: urlData } = supabase.storage.from('count-images').getPublicUrl(originalName)
            originalImages.push(urlData.publicUrl)
          }
        }

        const ext = image.mediaType === 'image/png' ? 'png' : 'jpg'
        const filename = `${user.id}/${timestamp}-vision-${image.index}.${ext}`
        const buffer = Buffer.from(image.base64, 'base64')
        const { data: uploadData } = await supabase.storage
          .from('count-images')
          .upload(filename, buffer, { contentType: image.mediaType, upsert: false })

        if (uploadData) {
          const { data: urlData } = supabase.storage.from('count-images').getPublicUrl(filename)
          imagesUsed.push(urlData.publicUrl)
        }
      }

      const stored: StoredCountAnalysis = {
        final_items: consensus.final_items,
        final_total_units: consensus.final_total_units,
        overall_confidence: consensus.overall_confidence,
        needs_user_confirmation: consensus.needs_user_confirmation,
        model_outputs: consensus.model_outputs,
        consensus_summary: consensus.consensus_summary,
        user_corrected_items: null,
        images_used: imagesUsed,
        original_images: originalImages,
        image_prep_logs: imagePrepLogs,
        vision_mode: visionMode,
        burst_image_count: preparedImages.length,
        warnings: consensus.warnings,
        models_disagreed: consensus.models_disagreed,
        created_at: new Date().toISOString(),
      }

      const { data: inserted } = await supabase
        .from('count_images')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          image_url: imagesUsed[0] ?? '',
          ai_response: stored,
        })
        .select('id')
        .single()

      countImageId = inserted?.id ?? null
    }

    return NextResponse.json({
      count_image_id: countImageId,
      final_items: consensus.final_items,
      final_total_units: consensus.final_total_units,
      overall_confidence: consensus.overall_confidence,
      needs_user_confirmation: consensus.needs_user_confirmation,
      consensus_summary: consensus.consensus_summary,
      models_disagreed: consensus.models_disagreed,
      warnings: consensus.warnings,
      model_outputs: consensus.model_outputs,
      providers_used: consensus.providers_used,
      burst_image_count: preparedImages.length,
      images_used: imagesUsed,
      vision_mode: visionMode,
      image_prep_logs: imagePrepLogs,
    })
  } catch (err) {
    console.error('Analyse error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 },
    )
  }
}
