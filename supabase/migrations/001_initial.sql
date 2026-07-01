CREATE TABLE stock_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users,
  session_name text NOT NULL,
  location text,
  status text DEFAULT 'in_progress',
  total_units integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES stock_sessions ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users,
  product_name text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  confidence text DEFAULT 'high',
  image_url text,
  notes text,
  manually_adjusted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE count_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES stock_sessions ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users,
  image_url text NOT NULL,
  ai_response jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE stock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE count_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own rows
CREATE POLICY "Users can manage their own sessions"
  ON stock_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own stock items"
  ON stock_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own count images"
  ON count_images FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage bucket for count images (run in Supabase dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('count-images', 'count-images', false);
