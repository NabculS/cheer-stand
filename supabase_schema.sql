-- ============================================================
-- Cheer Stand - Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  student_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  password TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  best_score INTEGER DEFAULT 0,
  progress INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  wrong INTEGER DEFAULT 0,
  finished BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Game History Table (Records every game session played)
CREATE TABLE IF NOT EXISTS public.game_history (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT REFERENCES public.users(student_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  time_used INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for fast leaderboard & history lookup
CREATE INDEX IF NOT EXISTS idx_users_best_score ON public.users(best_score DESC);
CREATE INDEX IF NOT EXISTS idx_users_score ON public.users(score DESC);
CREATE INDEX IF NOT EXISTS idx_game_history_student ON public.game_history(student_id);
CREATE INDEX IF NOT EXISTS idx_game_history_score ON public.game_history(score DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;

-- 5. Policies (Allow anon reads/writes for camp demo)
CREATE POLICY "Allow public read users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow public insert users" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update users" ON public.users FOR UPDATE USING (true);
CREATE POLICY "Allow public delete users" ON public.users FOR DELETE USING (true);

CREATE POLICY "Allow public read history" ON public.game_history FOR SELECT USING (true);
CREATE POLICY "Allow public insert history" ON public.game_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete history" ON public.game_history FOR DELETE USING (true);
