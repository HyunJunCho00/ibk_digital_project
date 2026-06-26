'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase, fetchCurrentRankings } from '@/lib/supabase'
import { QUESTIONS, SELECTED_COUNT, QUESTION_TIME_MS, calcPoints } from '@/lib/questions'
import type { GameState, RankEntry } from '@/lib/supabase'

type Phase = 'waiting' | 'question' | 'waiting_reveal' | 'revealing' | 'finished'

interface QuestionResult {
  selected: string | null
  correct: boolean
  points: number
}

const RADIUS = 45
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function GamePage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('waiting')
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_MS)
  const [selected, setSelected] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<QuestionResult | null>(null)
  const [totalScore, setTotalScore] = useState(0)
  const [nickname, setNickname] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [rankings, setRankings] = useState<RankEntry[]>([])
  const [questionIds, setQuestionIds] = useState<number[]>([])

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionStartRef = useRef<number>(0)
  const answeredRef = useRef(false)

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  async function fetchRankings(jitter = 0) {
    setRankings(await fetchCurrentRankings(jitter))
  }

  // 타이머 종료 시 — 정답 공개는 하지 않고 대기 상태로만 전환
  const handleTimerEnd = useCallback(async (qNum: number, sId: string, nick: string) => {
    clearTimer()
    setPhase('waiting_reveal')
    if (!answeredRef.current) {
      answeredRef.current = true
      setLastResult({ selected: null, correct: false, points: 0 })
      await supabase.from('answers').insert({
        session_id: sId, nickname: nick, question_number: qNum,
        answer: 'TIMEOUT', is_correct: false, response_time_ms: QUESTION_TIME_MS, points: 0,
      })
    }
  }, [])

  const startTimer = useCallback((questionStartedAt: string, qNum: number, sId: string, nick: string) => {
    clearTimer()
    answeredRef.current = false
    const serverStart = new Date(questionStartedAt).getTime()
    const elapsed = Date.now() - serverStart
    const remaining = Math.max(0, QUESTION_TIME_MS - elapsed)
    questionStartRef.current = serverStart
    setTimeLeft(remaining)
    setSelected(null)
    setLastResult(null)
    setPhase('question')
    if (remaining <= 0) { handleTimerEnd(qNum, sId, nick); return }
    timerRef.current = setInterval(() => {
      const left = Math.max(0, QUESTION_TIME_MS - (Date.now() - questionStartRef.current))
      setTimeLeft(left)
      if (left <= 0) handleTimerEnd(qNum, sId, nick)
    }, 50)
  }, [handleTimerEnd])

  useEffect(() => {
    const sId = localStorage.getItem('ibk_session_id')
    const nick = localStorage.getItem('ibk_nickname')
    if (!sId || !nick) { router.replace('/'); return }
    setSessionId(sId)
    setNickname(nick)

    async function init() {
      // 대규모 동시 접속 시 DB 부하 분산 (최대 2초 랜덤 딜레이)
      await new Promise(r => setTimeout(r, Math.random() * 2000))
      const { data } = await supabase.from('game_state').select('*').eq('id', 1).single()
      if (!data) return
      const gs = data as GameState
      if (gs.status === 'finished') { router.replace('/ranking'); return }

      if (gs.status === 'question' && gs.question_started_at) {
        setCurrentQuestion(gs.current_question)
        if (gs.question_ids) setQuestionIds(gs.question_ids)

        // 내 누적 점수 복원
        const { data: myPrev } = await supabase.from('answers').select('points').eq('session_id', sId)
        if (myPrev) setTotalScore(myPrev.reduce((s, r) => s + r.points, 0))

        // 이번 문제 이미 답했는지 확인
        const { data: existing } = await supabase
          .from('answers').select('answer, points, is_correct')
          .eq('session_id', sId).eq('question_number', gs.current_question).maybeSingle()

        if (existing) {
          answeredRef.current = true
          setSelected(existing.answer)
          setLastResult({ selected: existing.answer, correct: existing.is_correct, points: existing.points })
        }

        if (gs.answer_revealed) {
          setPhase('revealing')
          fetchRankings(500)
        } else {
          const elapsed = Date.now() - new Date(gs.question_started_at).getTime()
          if (elapsed >= QUESTION_TIME_MS) {
            // 타이머 이미 끝남 — 아직 답 안 했으면 TIMEOUT 삽입
            if (!existing) {
              answeredRef.current = true
              setLastResult({ selected: null, correct: false, points: 0 })
              await supabase.from('answers').insert({
                session_id: sId, nickname: nick, question_number: gs.current_question,
                answer: 'TIMEOUT', is_correct: false, response_time_ms: QUESTION_TIME_MS, points: 0,
              })
            }
            setPhase('waiting_reveal')
          } else {
            startTimer(gs.question_started_at!, gs.current_question, sId!, nick!)
          }
        }
      }
    }
    init()

    const channel = supabase.channel('game-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        const gs = payload.new as GameState
        if (gs.status === 'finished') { clearTimer(); router.push('/ranking'); return }
        if (gs.answer_revealed) {
          // 호스트가 정답 공개
          clearTimer()
          setPhase('revealing')
          fetchRankings(2000)
          return
        }
        if (gs.status === 'question' && gs.question_started_at) {
          setCurrentQuestion(gs.current_question)
          if (gs.question_ids) setQuestionIds(gs.question_ids)
          startTimer(gs.question_started_at, gs.current_question, sId, nick)
        }
      })
      .subscribe()

    return () => { clearTimer(); supabase.removeChannel(channel) }
  }, [router, startTimer])

  async function handleAnswer(choice: string) {
    if (answeredRef.current || phase !== 'question') return
    answeredRef.current = true
    const responseTimeMs = Math.max(0, Date.now() - questionStartRef.current)
    const q = QUESTIONS.find(q => q.id === questionIds[currentQuestion - 1])
    if (!q) return
    const isCorrect = choice === q.answer
    const pts = isCorrect ? calcPoints(responseTimeMs) : 0
    setSelected(choice)
    setLastResult({ selected: choice, correct: isCorrect, points: pts })
    if (isCorrect) setTotalScore((s) => s + pts)
    await supabase.from('answers').insert({
      session_id: sessionId, nickname, question_number: currentQuestion,
      answer: choice, is_correct: isCorrect, response_time_ms: responseTimeMs, points: pts,
    })
    // 서버 트리거가 재계산한 실제 점수로 동기화
    const { data: actual } = await supabase.from('answers')
      .select('points')
      .eq('session_id', sessionId)
      .eq('question_number', currentQuestion)
      .single()
    if (actual && actual.points !== pts) {
      const diff = actual.points - pts
      setLastResult(r => r ? { ...r, points: actual.points } : r)
      if (isCorrect) setTotalScore(s => s + diff)
    }
  }

  const totalQ = questionIds.length || SELECTED_COUNT
  const q = currentQuestion >= 1 && questionIds.length > 0
    ? QUESTIONS.find(q => q.id === questionIds[currentQuestion - 1]) ?? null
    : null
  const timerRatio = timeLeft / QUESTION_TIME_MS
  const strokeDashoffset = CIRCUMFERENCE * (1 - timerRatio)
  const timerColor = timerRatio > 0.5 ? '#4ade80' : timerRatio > 0.25 ? '#FFB300' : '#EF4444'
  const myRank = rankings.findIndex((r) => r.nickname === nickname) + 1
  const myTotalScore = myRank > 0 ? rankings[myRank - 1].total_points : totalScore

  const getMascot = () => {
    if (phase === 'waiting') return '/인사.png'
    if (phase === 'question') return selected ? '/응원.png' : '/집중.png'
    if (phase === 'waiting_reveal') return selected ? '/응원.png' : '/인사.png'
    if (phase === 'revealing') {
      if (!lastResult?.selected) return '/응원.png'
      return lastResult.correct ? '/정답.png' : '/확인.png'
    }
    return '/인사.png'
  }

  return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(160deg, #003087 0%, #001A4D 100%)' }}>

      {/* 상단 바 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="font-black text-sm text-white/80">{nickname}</span>
        {currentQuestion > 0 && (
          <div className="flex items-center gap-3 text-xs text-blue-300">
            <span>{currentQuestion}/{totalQ}</span>
            {phase === 'revealing' && (
              <>
                <span className="font-bold" style={{ color: '#FFB300' }}>{myTotalScore}점</span>
                {myRank > 0 && <span className="bg-white/10 px-2 py-0.5 rounded-full text-white font-bold">{myRank}위</span>}
              </>
            )}
          </div>
        )}
      </div>

      {/* 진행바 */}
      {currentQuestion > 0 && (
        <div className="px-4 mb-3">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-yellow-400 rounded-full transition-all duration-500"
              style={{ width: `${(currentQuestion / totalQ) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center px-4 pb-6">

        {/* ── 대기 ── */}
        {phase === 'waiting' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center slide-up">
            <div className="mb-4 w-32 h-32 rounded-full bg-white flex items-center justify-center shadow-2xl overflow-hidden">
              <Image src="/인사.png" alt="" width={120} height={120} className="object-contain" />
            </div>
            <p className="text-white text-xl font-black mb-2">곧 시작합니다!</p>
            <p className="text-blue-300 text-sm">화면을 닫지 마세요</p>
            <div className="flex gap-2 mt-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-blue-300 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── 문제 풀이 ── */}
        {phase === 'question' && q && (
          <div className="flex-1 flex flex-col w-full max-w-sm mx-auto">
            <div className="flex items-center justify-between mb-4 mt-2">
              <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg overflow-hidden pop-in shrink-0">
                <Image src={getMascot()} alt="" width={76} height={76} className="object-contain" />
              </div>
              <div className="relative w-20 h-20">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                  <circle cx="50" cy="50" r={RADIUS} fill="none" stroke={timerColor}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE} strokeDashoffset={strokeDashoffset}
                    style={{ transition: 'stroke-dashoffset 0.05s linear, stroke 0.3s' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white font-black text-2xl">{Math.ceil(timeLeft / 1000)}</span>
                </div>
              </div>
            </div>

            <p className="text-sm font-bold mb-2 text-center" style={{ color: '#FFB300' }}>
              Q{currentQuestion} / {totalQ}
            </p>

            <div className="rounded-2xl p-5 mb-5 pop-in"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <p className="text-white text-lg font-bold text-center leading-relaxed">{q.question}</p>
            </div>

            <div className="flex gap-3 mb-4">
              {(['O', 'X'] as const).map((btn) => {
                const isSelected = selected === btn
                let style: React.CSSProperties = btn === 'O'
                  ? { background: 'rgba(34,197,94,0.15)', borderColor: '#22c55e', color: '#86efac' }
                  : { background: 'rgba(239,68,68,0.15)', borderColor: '#ef4444', color: '#fca5a5' }
                if (isSelected) {
                  style = btn === 'O'
                    ? { background: 'rgba(34,197,94,0.5)', borderColor: '#22c55e', color: 'white' }
                    : { background: 'rgba(239,68,68,0.5)', borderColor: '#ef4444', color: 'white' }
                } else if (selected) {
                  style = { ...style, opacity: 0.35 }
                }
                return (
                  <button key={btn} onClick={() => handleAnswer(btn)}
                    disabled={selected !== null}
                    className={'flex-1 h-24 rounded-2xl text-6xl font-black transition-all border-2' + (!selected ? ' active:scale-95' : '')}
                    style={style}>
                    {btn}
                  </button>
                )
              })}
            </div>

            {selected
              ? <p className="text-center text-blue-200 text-sm animate-pulse">선택 완료! 곧 정답을 공개합니다...</p>
              : <p className="text-center text-blue-300/50 text-xs">O 또는 X를 선택하세요</p>
            }
          </div>
        )}

        {/* ── 정답 공개 대기 ── */}
        {phase === 'waiting_reveal' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <div className="w-28 h-28 rounded-full bg-white flex items-center justify-center shadow-2xl overflow-hidden pop-in">
                <Image src={getMascot()} alt="" width={108} height={108} className="object-contain" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-32 h-32 rounded-full animate-ping opacity-10" style={{ background: '#FFB300' }} />
              </div>
            </div>

            {selected ? (
              <div className="mb-4">
                <p className="text-white/60 text-sm mb-1">내 선택</p>
                <span className={`text-6xl font-black ${selected === 'O' ? 'text-green-400' : 'text-red-400'}`}>
                  {selected}
                </span>
              </div>
            ) : (
              <p className="text-white/50 text-sm mb-4">시간 초과</p>
            )}

            <p className="text-white font-black text-xl mb-1">잠시만요!</p>
            <p className="text-blue-300 text-sm">진행자가 정답을 공개합니다</p>
            <div className="flex gap-2 mt-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce"
                  style={{ animationDelay: `${i * 200}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── 정답 공개 ── */}
        {phase === 'revealing' && q && (
          <div className="flex-1 flex flex-col w-full max-w-sm mx-auto slide-up overflow-y-auto">

            {/* 결과 (compact) */}
            <div className={`flex items-center gap-3 mt-2 mb-4 rounded-2xl px-4 py-3 border ${
              lastResult?.correct ? 'bg-green-500/20 border-green-400/40'
              : !lastResult?.selected ? 'bg-white/10 border-white/20'
              : 'bg-red-500/20 border-red-400/40'}`}>
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow overflow-hidden shrink-0 pop-in">
                <Image src={getMascot()} alt="" width={44} height={44} className="object-contain" />
              </div>
              <div>
                <p className="text-white font-black text-lg leading-tight">
                  {!lastResult?.selected ? '⏰ 시간 초과!' : lastResult.correct ? '정답! 🎉' : '오답 😢'}
                </p>
                {lastResult?.correct && (
                  <p className="font-black text-sm" style={{ color: '#FFB300' }}>+{lastResult.points}점 획득!</p>
                )}
              </div>
            </div>

            {/* TOP 3 */}
            {rankings.length > 0 && (
              <div className="rounded-2xl overflow-hidden mb-4"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="px-4 py-2" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <p className="text-xs font-bold text-white/50">🏆 TOP 3</p>
                </div>
                {rankings.slice(0, 3).map((r, i) => (
                  <div key={r.nickname}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0"
                    style={{ background: i === 0 ? 'rgba(255,215,0,0.1)' : i === 1 ? 'rgba(192,192,192,0.07)' : 'rgba(205,127,50,0.07)' }}>
                    <span className="w-6 text-center shrink-0 text-base">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                    </span>
                    <span className="flex-1 truncate text-sm font-bold text-white/90">{r.nickname}</span>
                    <span className="font-black text-sm text-white/70">{r.total_points}점</span>
                  </div>
                ))}
              </div>
            )}

            {/* 내 순위 */}
            {myRank > 0 && (
              <div className="rounded-2xl px-5 py-4 mb-4 flex items-center gap-4 pop-in"
                style={{ background: 'rgba(255,179,0,0.15)', border: '2px solid rgba(255,179,0,0.5)' }}>
                <div className="flex-1">
                  <p className="text-xs font-semibold mb-0.5" style={{ color: 'rgba(255,179,0,0.7)' }}>내 순위</p>
                  <p className="font-black text-white/80 text-sm">{nickname}</p>
                </div>
                <div className="text-right">
                  <p className="font-black" style={{ color: '#FFB300', fontSize: '2.5rem', lineHeight: 1 }}>{myRank}위</p>
                  <p className="text-white/40 text-xs">{myTotalScore}점</p>
                </div>
              </div>
            )}

            {/* 해설 */}
            <div className="rounded-2xl p-4 mb-4"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <p className="text-xs font-bold mb-1" style={{ color: '#FFB300' }}>해설</p>
              <p className="text-white/70 text-sm leading-relaxed">{q.explanation}</p>
            </div>

            <p className="text-blue-400 text-xs text-center animate-pulse pb-2">
              호스트가 다음 문제를 진행합니다...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
