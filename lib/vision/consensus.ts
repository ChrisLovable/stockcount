import { analyseWithAnthropic } from './providers/anthropic'
import { prepareItemsForReview, sumAiSuggestedTotalUnits } from './stackCount'
import type { ConsensusResult, VisionImageInput } from './types'

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name]
  if (value === undefined) return fallback
  return value === 'true' || value === '1'
}

export async function runVisionConsensus(input: VisionImageInput): Promise<ConsensusResult> {
  const result = await analyseWithAnthropic(input)
  const output = result.output
  const requireConfirmation = envBool('VISION_REQUIRE_USER_CONFIRMATION', true)
  const items = prepareItemsForReview(output.items)
  const needsDepth = items.some(item => item.needs_depth_confirmation)

  return {
    final_items: items,
    final_total_units: sumAiSuggestedTotalUnits(items),
    overall_confidence: needsDepth ? 'medium' : output.overall_confidence,
    needs_user_confirmation:
      requireConfirmation ||
      output.needs_user_confirmation ||
      output.overall_confidence === 'low' ||
      needsDepth,
    consensus_summary: needsDepth
      ? 'AI estimate only — confirm visible count and depth for each product group before saving.'
      : 'Confirm visible count and final quantity for each product group before saving.',
    models_disagreed: false,
    warnings: output.warnings,
    model_outputs: { anthropic: output },
    providers_used: ['anthropic'],
    burst_image_count: input.images.length,
  }
}
