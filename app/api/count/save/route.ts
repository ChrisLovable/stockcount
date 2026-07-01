import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { VisionItem } from '@/lib/vision/schema'
import { validateItemsForServerSave } from '@/lib/vision/stackCount'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      sessionId,
      items,
      userId,
      countImageId,
      userCorrected,
      userCorrectedItems,
    } = body as {
      sessionId: string
      items: Array<{ name: string; count: number; confidence: string; notes?: string; manually_adjusted?: boolean }>
      userId?: string
      countImageId?: string | null
      userCorrected?: boolean
      userCorrectedItems?: VisionItem[]
    }

    if (!sessionId || !items?.length) {
      return NextResponse.json({ error: 'Missing sessionId or items' }, { status: 400 })
    }

    // Server-side integrity check: if the client sent the full corrected VisionItem[]
    // (the normal confirmed-count flow), re-validate the visible × depth arithmetic here.
    // This is the same rule enforced in the UI, but the UI can be bypassed — this cannot.
    if (userCorrected && userCorrectedItems?.length) {
      const errors = validateItemsForServerSave(userCorrectedItems)
      if (errors.length > 0) {
        return NextResponse.json(
          { error: 'Stock count failed validation', details: errors },
          { status: 422 },
        )
      }
    }

    const rows = items.map(item => ({
      session_id: sessionId,
      user_id: userId || user.id,
      product_name: item.name,
      count: item.count,
      confidence: item.confidence || 'high',
      notes: item.notes ?? null,
      manually_adjusted: item.manually_adjusted ?? userCorrected ?? false,
    }))

    const { error: insertError } = await supabase.from('stock_items').insert(rows)
    if (insertError) throw insertError

    if (countImageId && userCorrected && userCorrectedItems) {
      const { data: existing } = await supabase
        .from('count_images')
        .select('ai_response')
        .eq('id', countImageId)
        .eq('user_id', user.id)
        .single()

      if (existing?.ai_response && typeof existing.ai_response === 'object') {
        await supabase
          .from('count_images')
          .update({
            ai_response: {
              ...existing.ai_response,
              user_corrected_items: userCorrectedItems,
              final_items: userCorrectedItems,
              final_total_units: userCorrectedItems.reduce((sum, i) => sum + i.total_units, 0),
            },
          })
          .eq('id', countImageId)
          .eq('user_id', user.id)
      }
    }

    const { data: allItems } = await supabase
      .from('stock_items')
      .select('count')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)

    const total = (allItems || []).reduce((sum, i) => sum + (i.count || 0), 0)

    const { data: updatedSession, error: updateError } = await supabase
      .from('stock_sessions')
      .update({ total_units: total })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ session: updatedSession })
  } catch (err) {
    console.error('Save error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Save failed' }, { status: 500 })
  }
}
