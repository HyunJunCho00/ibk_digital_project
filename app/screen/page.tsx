'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { supabase, fetchCurrentRankings } from '@/lib/supabase'
import { QUESTIONS, SELECTED_COUNT, QUESTION_TIME_MS } from '@/lib/questions'
import type { GameState, RankEntry } from '@/lib/supabase'

const RADIUS = 70
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function ScreenPage() {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [screenPhase, setScreenPhase] = useState<'question' | 'waiting_reveal' | 'reveal'>('question')
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_MS)
  const [rankings, setRankings] = useState<RankEntry[]>([])
  const [participantCount, setParticipantCount] = useState(0)
  const [answerCount, setAnswerCount] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef<number>(0)
  const currentQRef = useRef<number>(0)

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const fetchRankings = useCallback(async (qNum?: number) => {
    setRankings(await fetchCurrentRankings())
    if (qNum) {
      const { data: participants } = await supabase.from('participants').select('session_id')
      const sessionIds = participants?.map(p => p.session_id) ?? []
      const { count } = await supabase.from('answers')
        .select('*', { count: 'exact', head: true })
        .eq('question_number', qNum)
        .in('session_id', sessionIds)
      setAnswerCount(count ?? 0)
    }
  }, [])

  // 정답 공개 / 게임 종료 시 랭킹 fetch
  useEffect(() => {
    if (screenPhase === 'reveal') fetchRankings(currentQRef.current)
  }, [screenPhase, fetchRankings])

  useEffect(() => {
    if (gameState?.status === 'finished') fetchRankings()
  }, [gameState?.status, fetchRankings])

  const startTimer = useCallback((questionStartedAt: string, qNum: number) => {
    clearTimer()
    setScreenPhase('question')
    setAnswerCount(0)
    currentQRef.current = qNum
    const serverStart = new Date(questionStartedAt).getTime()
    startRef.current = serverStart
    const remaining = Math.max(0, QUESTION_TIME_MS - (Date.now() - serverStart))
    setTimeLeft(remaining)
    if (remaining <= 0) { setScreenPhase('waiting_reveal'); return }
    timerRef.current = setInterval(() => {
      const left = Math.max(0, QUESTION_TIME_MS - (Date.now() - startRef.current))
      setTimeLeft(left)
      if (left <= 0) { clearTimer(); setScreenPhase('waiting_reveal') }
    }, 50)
  }, [])

  useEffect(() => {
    async function init() {
      const [{ data: gs }, { count }] = await Promise.all([
        supabase.from('game_state').select('*').eq('id', 1).single(),
        supabase.from('participants').select('*', { count: 'exact', head: true }),
      ])
      setParticipantCount(count ?? 0)
      if (gs) {
        setGameState(gs as GameState)
        if (gs.status === 'question' && gs.question_started_at) {
          startTimer(gs.question_started_at, gs.current_question)
          fetchRankings(gs.current_question)
        } else if (gs.status === 'finished') {
          fetchRankings()
        }
      }
    }
    init()

    const channel = supabase.channel('screen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, (payload) => {
        const gs = payload.new as GameState
        setGameState(gs)
        if (gs.answer_revealed) {
          clearTimer()
          setScreenPhase('reveal')
          fetchRankings(gs.current_question)
        } else if (gs.status === 'question' && gs.question_started_at) {
          startTimer(gs.question_started_at, gs.current_question)
        } else {
          clearTimer()
          if (gs.status === 'finished') fetchRankings()
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants' }, () => {
        setParticipantCount((c) => c + 1)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers' }, (payload) => {
        setAnswerCount((c) => c + 1)
        fetchRankings(payload.new.question_number)
      })
      .subscribe()

    return () => { clearTimer(); supabase.removeChannel(channel) }
  }, [startTimer, fetchRankings])

  const questionIds = gameState?.question_ids ?? []
  const totalQ = questionIds.length || SELECTED_COUNT
  const q = gameState?.current_question && gameState.current_question >= 1 && questionIds.length > 0
    ? QUESTIONS.find(q => q.id === questionIds[gameState.current_question - 1]) ?? null
    : null
  const timerRatio = timeLeft / QUESTION_TIME_MS
  const strokeDashoffset = CIRCUMFERENCE * (1 - timerRatio)
  const timerColor = timerRatio > 0.5 ? '#4ade80' : timerRatio > 0.25 ? '#FFB300' : '#EF4444'
  const status = gameState?.status ?? 'waiting'

  return (
    <div className="min-h-screen flex flex-col select-none overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #003087 0%, #001A4D 100%)' }}>
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.5) 39px, rgba(255,255,255,0.5) 40px)' }} />

      {/* 헤더 */}
      <div className="relative flex items-center justify-between px-8 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="text-xs font-black px-3 py-1 rounded-full" style={{ background: '#FFB300', color: '#001A4D' }}>i-ONE Bank</div>
          <h1 className="text-white font-black text-xl">예금자보호 OX퀴즈</h1>
        </div>
        <div className="flex items-center gap-6 text-sm text-white/60">
          <span>참가자 <span className="text-white font-bold">{participantCount}명</span></span>
          {status === 'question' && screenPhase === 'question' && (
            <span>응답 <span className="text-yellow-300 font-bold">{answerCount}명</span></span>
          )}
        </div>
      </div>

      <div className="relative flex-1 flex p-6">

        {/* 대기 화면 */}
        {status === 'waiting' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center slide-up">
            <Image src="/인사.png" alt="" width={180} height={180} className="mx-auto mb-6 drop-shadow-2xl" />
            <h2 className="text-white text-5xl font-black mb-4">참가자를 모집 중입니다</h2>
            <p className="text-blue-300 text-2xl">현재 <span className="font-black" style={{ color: '#FFB300' }}>{participantCount}명</span> 참가 중</p>
            <p className="text-blue-300 text-lg mt-4">호스트가 시작하면 퀴즈가 시작됩니다</p>
          </div>
        )}

        {/* ── 정답 공개 대기 (서스펜스) ── */}
        {status === 'question' && q && screenPhase === 'waiting_reveal' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="relative mb-8">
              <Image src="/집중.png" alt="" width={160} height={160} className="mx-auto drop-shadow-2xl pop-in" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 rounded-full animate-ping opacity-10 bg-yellow-400" />
              </div>
            </div>
            <h2 className="text-white text-5xl font-black mb-3">잠시만요...</h2>
            <p className="text-blue-200 text-2xl mb-2">진행자가 정답을 공개합니다</p>
            <p className="text-white/40 text-lg">응답률 {participantCount > 0 ? Math.round((answerCount / participantCount) * 100) : 0}% ({answerCount}/{participantCount}명 응답)</p>
            <div className="flex gap-3 mt-6">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="w-3 h-3 rounded-full bg-yellow-400 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── 문제 화면 ── */}
        {status === 'question' && q && screenPhase === 'question' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-4xl">
              <div className="flex items-center justify-between mb-6">
                <span className="text-2xl font-black" style={{ color: '#FFB300' }}>Q{gameState?.current_question}.</span>
                <div className="flex items-center gap-3">
                  <Image src="/집중.png" alt="" width={60} height={60} className="drop-shadow-lg" />
                  <div className="relative w-28 h-28">
                    <svg className="w-28 h-28 -rotate-90" viewBox="0 0 160 160">
                      <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
                      <circle cx="80" cy="80" r={RADIUS} fill="none" stroke={timerColor}
                        strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={CIRCUMFERENCE} strokeDashoffset={strokeDashoffset}
                        style={{ transition: 'stroke-dashoffset 0.05s linear, stroke 0.3s' }} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-white font-black text-4xl">{Math.ceil(timeLeft / 1000)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl p-10 mb-8 border border-white/20"
                style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)' }}>
                <p className="text-white text-4xl font-bold text-center leading-relaxed">{q.question}</p>
              </div>

              <div className="flex gap-6">
                <div className="flex-1 rounded-2xl py-6 text-center border-2 border-green-500/40 bg-green-500/10">
                  <span className="text-green-400 text-7xl font-black">O</span>
                </div>
                <div className="flex-1 rounded-2xl py-6 text-center border-2 border-red-500/40 bg-red-500/10">
                  <span className="text-red-400 text-7xl font-black">X</span>
                </div>
              </div>

              {participantCount > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-white/50 text-sm mb-1">
                    <span>응답 현황</span>
                    <span>{answerCount} / {participantCount}명</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-400 rounded-full transition-all duration-300"
                      style={{ width: `${participantCount > 0 ? (answerCount / participantCount) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 정답 공개 화면 ── */}
        {status === 'question' && q && screenPhase === 'reveal' && (
          <div className="flex-1 flex gap-10 items-center">

            {/* 왼쪽: 정답 + 해설 */}
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <p className="text-white/50 text-xl font-semibold mb-1 slide-up">정답</p>
              <div
                className={`font-black leading-none answer-bounce select-none
                  ${q.answer === 'O' ? 'text-green-400' : 'text-red-400'}`}
                style={{
                  fontSize: 'clamp(120px, 18vw, 220px)',
                  textShadow: q.answer === 'O'
                    ? '0 0 80px rgba(74,222,128,0.6)'
                    : '0 0 80px rgba(248,113,113,0.6)',
                }}>
                {q.answer}
              </div>
              <div
                className="reveal-fade mt-6 rounded-3xl p-6 border border-white/20 max-w-xl"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(8px)',
                  animationDelay: '0.4s',
                }}>
                <p className="text-white text-xl leading-relaxed">{q.explanation}</p>
              </div>
            </div>

            {/* 오른쪽: TOP 3 */}
            <div className="w-[340px] shrink-0">
              <p className="text-2xl font-black mb-5 text-center reveal-fade" style={{ color: '#FFB300' }}>
                🏆 현재 순위
              </p>
              <div className="flex flex-col gap-3">
                {rankings.slice(0, 3).map((r, i) => (
                  <div
                    key={r.nickname}
                    className="rank-slide flex items-center gap-4 px-5 py-4 rounded-2xl"
                    style={{
                      animationDelay: `${i * 100}ms`,
                      background: i === 0 ? 'rgba(255,215,0,0.2)' : i === 1 ? 'rgba(192,192,192,0.15)' : 'rgba(205,127,50,0.15)',
                      border: `1px solid ${i === 0 ? 'rgba(255,215,0,0.4)' : i === 1 ? 'rgba(192,192,192,0.3)' : 'rgba(205,127,50,0.3)'}`,
                    }}>
                    <span className="text-3xl w-9 text-center shrink-0">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                    </span>
                    <span className="flex-1 text-white font-bold text-xl truncate">{r.nickname}</span>
                    <span className={`font-black text-2xl shrink-0 ${i === 0 ? 'text-yellow-300' : 'text-white/80'}`}>
                      {r.total_points}점
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 종료 화면 */}
        {status === 'finished' && (
          <div className="flex-1 flex flex-col items-center justify-center slide-up">
            <div className="flex items-center justify-center gap-4 mb-10">
              <Image src="/축하.png" alt="" width={64} height={64} className="drop-shadow-2xl" />
              <h2 className="text-5xl font-black" style={{ color: '#FFB300' }}>최종 결과 발표!</h2>
              <Image src="/축하.png" alt="" width={64} height={64} className="drop-shadow-2xl scale-x-[-1]" />
            </div>

            {rankings.length > 0 && (
              <div className="flex items-end justify-center gap-8">

                {/* 2위 */}
                <div className="flex flex-col items-center rank-slide" style={{ animationDelay: '0.15s' }}>
                  <Image src="/최고.png" alt="" width={80} height={80} className="drop-shadow-xl mb-3" />
                  <span className="text-5xl mb-4">🥈</span>
                  <div className="rounded-3xl px-8 py-6 text-center"
                    style={{ background: 'rgba(192,192,192,0.15)', border: '2px solid rgba(192,192,192,0.35)', minWidth: '200px' }}>
                    <p className="text-white font-black text-2xl mb-2">{rankings[1]?.nickname ?? '-'}</p>
                    <p className="font-black text-3xl text-white/80">{rankings[1]?.total_points ?? 0}점</p>
                  </div>
                  <div className="mt-3 w-full h-24 rounded-t-2xl" style={{ background: 'rgba(192,192,192,0.2)' }} />
                </div>

                {/* 1위 */}
                <div className="flex flex-col items-center rank-slide" style={{ animationDelay: '0.4s' }}>
                  <Image src="/최고.png" alt="" width={110} height={110} className="drop-shadow-2xl mb-3" />
                  <span className="text-6xl mb-4">🥇</span>
                  <div className="rounded-3xl px-10 py-7 text-center"
                    style={{ background: 'rgba(255,179,0,0.2)', border: '3px solid rgba(255,179,0,0.6)', minWidth: '240px',
                      boxShadow: '0 0 60px rgba(255,179,0,0.2)' }}>
                    <p className="text-white font-black text-3xl mb-2">{rankings[0]?.nickname ?? '-'}</p>
                    <p className="font-black text-5xl" style={{ color: '#FFB300' }}>{rankings[0]?.total_points ?? 0}점</p>
                  </div>
                  <div className="mt-3 w-full h-36 rounded-t-2xl" style={{ background: 'rgba(255,179,0,0.15)' }} />
                </div>

                {/* 3위 */}
                <div className="flex flex-col items-center rank-slide" style={{ animationDelay: '0.08s' }}>
                  <Image src="/최고.png" alt="" width={80} height={80} className="drop-shadow-xl mb-3" />
                  <span className="text-5xl mb-4">🥉</span>
                  <div className="rounded-3xl px-8 py-6 text-center"
                    style={{ background: 'rgba(205,127,50,0.15)', border: '2px solid rgba(205,127,50,0.35)', minWidth: '200px' }}>
                    <p className="text-white font-black text-2xl mb-2">{rankings[2]?.nickname ?? '-'}</p>
                    <p className="font-black text-3xl text-white/80">{rankings[2]?.total_points ?? 0}점</p>
                  </div>
                  <div className="mt-3 w-full h-16 rounded-t-2xl" style={{ background: 'rgba(205,127,50,0.15)' }} />
                </div>

              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
