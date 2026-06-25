-- IBK 예금자보호 OX퀴즈 - Supabase 초기 설정 SQL
-- Supabase 대시보드 > SQL Editor에서 이 전체를 실행하세요.

-- 1. 게임 상태 테이블 (호스트가 제어)
CREATE TABLE IF NOT EXISTS game_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting',  -- 'waiting' | 'question' | 'finished'
  current_question INTEGER NOT NULL DEFAULT 0,
  question_started_at TIMESTAMPTZ,
  CONSTRAINT single_row CHECK (id = 1)
);

-- 초기 상태 삽입
INSERT INTO game_state (id, status, current_question)
VALUES (1, 'waiting', 0)
ON CONFLICT (id) DO NOTHING;

-- 2. 참가자 테이블
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL UNIQUE,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 답변 테이블
CREATE TABLE IF NOT EXISTS answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  question_number INTEGER NOT NULL,
  answer TEXT NOT NULL,           -- 'O' | 'X' | 'TIMEOUT'
  is_correct BOOLEAN NOT NULL,
  response_time_ms INTEGER NOT NULL,
  points INTEGER NOT NULL,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, question_number)
);

-- 4. RLS 비활성화 (데모용, 실서비스에서는 RLS 정책 설정 권장)
ALTER TABLE game_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE answers DISABLE ROW LEVEL SECURITY;

-- 5. Realtime 활성화 (Supabase 대시보드 > Database > Replication에서도 활성화 필요)
ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE answers;
