const RETAIL_STOCK_SYSTEM = `You are counting packaged goods stock for a retail inventory app.

A front-facing photo may show only the visible front layer.
The actual stock may be stacked in depth behind the visible layer.
Do NOT treat visible front count as the final count when items are stacked behind one another.

You may provide an estimated count, but do not pretend certainty about hidden depth.

You will receive one photo or multiple photos from a 10-second burst.
Use all images together.
The same stock area may be shown from different angles.
Do not double-count the same item just because it appears in more than one photo.

Separate clearly:
- visible_front_count (what you can see in the front layer)
- estimated_depth (your guess at layers deep — minimum 1)
- suggested_total_units (= visible_front_count × estimated_depth)
- needs_depth_confirmation (true when depth is not proven)
- needs_user_confirmation (true when user must confirm)

If multiple products look similar or labels are unclear, do not over-split groups.
Mark uncertain items and allow user correction.
Never output inconsistent arithmetic.
suggested_total_units MUST equal visible_front_count × estimated_depth unless a manual pack size is explicitly stated in the photo.

Your job:
1. Identify each distinct product group visible across the images.
2. Count the visible front layer only.
3. Estimate depth when stacking is likely but not fully visible.
4. Set needs_depth_confirmation=true unless side/top angle clearly proves depth.
5. Return JSON only. No markdown.`

const OUTPUT_SCHEMA = `{
  "items": [
    {
      "item_name": "string",
      "brand_name": "string | null",
      "container_type": "can | bottle | box | case | carton | tray | pack | unknown",
      "count_type": "single_items | stack | pack_case | mixed | unknown",
      "visible_front_count": number,
      "visible_rows": number,
      "visible_columns": number,
      "estimated_depth": number,
      "depth_confidence": "high | medium | low",
      "needs_depth_confirmation": boolean,
      "confirmed_depth": null,
      "suggested_total_units": number,
      "total_units": number,
      "confidence": "high | medium | low",
      "reasoning_note": "string",
      "seen_in_images": number[]
    }
  ],
  "total_units": number,
  "overall_confidence": "high | medium | low",
  "needs_user_confirmation": boolean,
  "warnings": string[]
}`

export function buildStockCountPrompt(
  instruction?: string,
  imageCount = 1,
): string {
  const focus = instruction?.trim()
    ? `\nUser note: "${instruction.trim()}"`
    : ''

  const imageNote =
    imageCount > 1
      ? `\nYou are analysing ${imageCount} burst photos numbered 1 to ${imageCount}. Reason across ALL images together. Do NOT add per-photo counts together. Use seen_in_images (1-based photo numbers) for each item. Count each distinct product group once.`
      : '\nYou are analysing a single photo.'

  return `${RETAIL_STOCK_SYSTEM}
${imageNote}
${focus}

Return ONLY valid JSON matching this schema:
${OUTPUT_SCHEMA}

Arithmetic rules (MANDATORY):
- suggested_total_units = visible_front_count × estimated_depth
- total_units = suggested_total_units (AI suggestion only — user confirms later)
- Root total_units = sum of each item's suggested_total_units
- Never output 8 visible × 2 depth with suggested_total_units 12 — that is invalid
- confirmed_depth must always be null

Stacking rules:
- count_type=stack when cans/bottles may be stacked in depth
- count_type=single_items when clearly one layer only (estimated_depth=1)
- count_type=pack_case for sealed cartons/cases
- If depth not clearly visible: needs_depth_confirmation=true, depth_confidence≠high
- Set needs_user_confirmation=true when any item needs depth confirmation
- warnings: list stacking ambiguities, unclear labels, and arithmetic notes`
}

export function buildArbiterPrompt(
  modelA: string,
  modelB: string,
  modelC?: string,
): string {
  const third = modelC ? `\n\nModel C:\n${modelC}` : ''

  return `You are an arbiter for retail stock counting. Vision models analysed the same set of shelf photos and disagreed.

Model A:
${modelA}

Model B:
${modelB}${third}

Choose the most likely correct stock count. suggested_total_units must equal visible_front_count × estimated_depth.

Return ONLY valid JSON matching this schema:
${OUTPUT_SCHEMA}

In warnings, explain which models disagreed and why you chose this answer.`
}
