-- Vision consensus fields are stored in count_images.ai_response (jsonb):
-- final_items, final_total_units, overall_confidence, needs_user_confirmation,
-- model_outputs, consensus_summary, user_corrected_items, image_url, warnings, models_disagreed

ALTER TABLE count_images
  ALTER COLUMN ai_response SET DEFAULT '{}'::jsonb;
