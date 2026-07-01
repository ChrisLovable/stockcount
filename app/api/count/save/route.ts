import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { sessionId, items, userId } = await request.json()
    if (!sessionId || !items?.length) {
      return NextResponse.json({ error: 'Missing sessionId or items' }, { status: 400 })
    }

    // Upsert items into stock_items
    const rows = items.map((item: { name: string; count: number; confidence: string }) => ({
      session_id: sessionId,
      user_id: userId || user.id,
      product_name: item.name,
      count: item.count,
      confidence: item.confidence || 'high',
    }))

    const { error: insertError } = await supabase.from('stock_items').insert(rows)
    if (insertError) throw insertError

    // Recalculate total from all items in session
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
