-- ============================================================
-- Cheer Stand - Supabase Schema (idempotent / run-safe)
-- วิธีใช้: Supabase Dashboard -> SQL Editor -> วางเฉพาะเนื้อหา SQL นี้ -> Run
-- ห้ามวาง path ของไฟล์ลงใน SQL Editor
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_history_run_id ON public.game_history(run_id);

-- 4. Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;

-- 5. Remove old demo policies (safe if they do not exist)
DROP POLICY IF EXISTS "Allow public read users" ON public.users;
DROP POLICY IF EXISTS "Allow public insert users" ON public.users;
DROP POLICY IF EXISTS "Allow public update users" ON public.users;
DROP POLICY IF EXISTS "Allow public delete users" ON public.users;
DROP POLICY IF EXISTS "Allow public read history" ON public.game_history;
DROP POLICY IF EXISTS "Allow public insert history" ON public.game_history;
DROP POLICY IF EXISTS "Allow public delete history" ON public.game_history;

-- 6. Server-only access.
-- The game talks to Supabase from server.js with the service_role key.
-- Do not expose the anon key to the browser for these tables.
REVOKE ALL ON TABLE public.users FROM anon, authenticated;
REVOKE ALL ON TABLE public.game_history FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.game_history_id_seq FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.game_history_id_seq TO service_role;

-- 7. Refresh PostgREST schema cache so the API sees the new tables immediately
NOTIFY pgrst, 'reload schema';
