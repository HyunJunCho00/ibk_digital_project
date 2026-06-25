import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type GameStatus = 'waiting' | 'question' | 'revealing' | 'finished'

export interface GameState {
  id: number
  status: GameStatus
  current_question: number
  question_started_at: string | null
  answer_revealed: boolean
  question_ids: number[] | null
}

export interface Answer {
  session_id: string
  nickname: string
  question_number: number
  answer: string
  is_correct: boolean
  response_time_ms: number
  points: number
}

export interface RankEntry {
  nickname: string
  total_points: number
  correct_count: number
}

export async function fetchCurrentRankings(jitterMs = 0): Promise<RankEntry[]> {
  // 다수 클라이언트 동시 호출 시 DB 부하 분산 (최대 jitterMs 랜덤 딜레이)
  if (jitterMs > 0) await new Promise(r => setTimeout(r, Math.random() * jitterMs))

  const { data: participants } = await supabase
    .from('participants')
    .select('session_id, nickname')
  if (!participants || participants.length === 0) return []

  const sessionIds = participants.map(p => p.session_id)
  const sessionToNick: Record<string, string> = {}
  participants.forEach(p => { sessionToNick[p.session_id] = p.nickname })

  const { data: answers } = await supabase
    .from('answers')
    .select('session_id, points, is_correct')
    .in('session_id', sessionIds)
  if (!answers) return []

  const map: Record<string, { total_points: number; correct_count: number }> = {}
  answers.forEach((r) => {
    if (!map[r.session_id]) map[r.session_id] = { total_points: 0, correct_count: 0 }
    map[r.session_id].total_points += r.points
    if (r.is_correct) map[r.session_id].correct_count++
  })

  return Object.entries(map)
    .map(([sid, s]) => ({ nickname: sessionToNick[sid] ?? '?', ...s }))
    .sort((a, b) => b.total_points - a.total_points)
}
