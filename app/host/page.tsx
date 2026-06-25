'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, fetchCurrentRankings } from '@/lib/supabase'
import { QUESTIONS, SELECTED_COUNT, QUESTION_TIME_MS } from '@/lib/questions'

function pickRandomIds(): number[] {
  const ids = QUESTIONS.map(q => q.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids.slice(0, SELECTED_COUNT)
}
import type { GameState, RankEntry } from '@/lib/supabase'
import { Suspense } from 'react'

const HOST_KEY = process.env.NEXT_PUBLIC_HOST_KEY ?? 'ibk2025'

interface AnswerStats {
  o_count: number
  x_count: number
  timeout_count: number
  total: number
}

function HostPanel() {
  const searchParams = useSearchParams()
  const key = searchParams.get('key')

  const [authorized, setAuthorized] = useState(false)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [participantCount, setParticipantCount] = useState(0)
  const [answerStats, setAnswerStats] = useState<AnswerStats>({ o_count: 0, x_count: 0, timeout_count: 0, total: 0 })
  const [advancing, setAdvancing] = useState(false)
  const [rankings, setRankings] = useState<RankEntry[]>([])

  useEffect(() => {
    if (key === HOST_KEY) setAuthorized(true)
  }, [key])

  const fetchAnswerStats = useCallback(async (questionNumber: number) => {
    const { data } = await supabase
      .from('answers')
      .select('answer')
      .eq('question_number', questionNumber)
    if (!data) return
    const stats: AnswerStats = { o_count: 0, x_count: 0, timeout_count: 0, total: data.length }
    data.forEach((r) => {
      if (r.answer === 'O') stats.o_count++
      else if (r.answer === 'X') stats.x_count++
      else stats.timeout_count++
    })
    setAnswerStats(stats)
  }, [])

  useEffect(() => {
    if (!authorized) return

    async function init() {
      const [gsResult, pcResult] = await Promise.all([
        supabase.from('game_state').select('*').eq('id', 1).single(),
        supabase.from('participants').select('*', { count: 'exact', head: true }),
      ])
      if (gsResult.data) {
        setGameState(gsResult.data as GameState)
        if (gsResult.data.status === 'question') {
          fetchAnswerStats(gsResult.data.current_question)
        }
      }
      setParticipantCount(pcResult.count ?? 0)
    }
    init()

    const channel = supabase
      .channel('host-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, (payload) => {
        if (payload.eventType === 'INSERT') setParticipantCount((c) => c + 1)
        if (payload.eventType === 'DELETE') setParticipantCount((c) => Math.max(0, c - 1))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, () => {
        setGameState((gs) => {
          if (gs?.status === 'question') fetchAnswerStats(gs.current_question)
          return gs
        })
        fetchCurrentRankings().then(setRankings)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        const gs = payload.new as GameState
        setGameState(gs)
        setAnswerStats({ o_count: 0, x_count: 0, timeout_count: 0, total: 0 })
        if (gs.status === 'question') fetchAnswerStats(gs.current_question)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [authorized, fetchAnswerStats])

  async function handleGenerate() {
    const ids = pickRandomIds()
    await supabase.from('game_state').update({ question_ids: ids }).eq('id', 1)
  }

  async function handleStart() {
    setAdvancing(true)
    await supabase.from('answers').delete().not('id', 'is', null)
    await supabase.from('game_state').update({
      status: 'question',
      current_question: 1,
      question_started_at: new Date().toISOString(),
      answer_revealed: false,
    }).eq('id', 1)
    setAdvancing(false)
  }

  async function handleRevealAnswer() {
    setAdvancing(true)
    await supabase.from('game_state').update({ answer_revealed: true }).eq('id', 1)
    setAdvancing(false)
  }

  async function handleAdvance() {
    if (!gameState) return
    setAdvancing(true)
    const nextQ = gameState.current_question + 1
    const totalQ = gameState.question_ids?.length ?? SELECTED_COUNT
    if (nextQ > totalQ) {
      await supabase.from('game_state').update({ status: 'finished' }).eq('id', 1)
    } else {
      await supabase.from('game_state').update({
        current_question: nextQ,
        question_started_at: new Date().toISOString(),
        answer_revealed: false,
      }).eq('id', 1)
    }
    setAdvancing(false)
  }

  async function handleReset() {
    if (!confirm('게임을 초기화하면 모든 참가자 데이터가 삭제됩니다. 계속할까요?')) return
    await Promise.all([
      supabase.from('answers').delete().not('id', 'is', null),
      supabase.from('participants').delete().not('id', 'is', null),
    ])
    await supabase.from('game_state').update({
      status: 'waiting',
      current_question: 0,
      question_started_at: null,
      answer_revealed: false,
      question_ids: null,
    }).eq('id', 1)
    setParticipantCount(0)
    setAnswerStats({ o_count: 0, x_count: 0, timeout_count: 0, total: 0 })
  }

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-2xl p-8 shadow text-center">
          <div className="text-5xl mb-4">🔒</div>
          <p className="text-gray-700 font-semibold">접근 권한이 없습니다.</p>
          <p className="text-gray-400 text-sm mt-2">URL에 ?key=ibk2025를 추가하세요.</p>
        </div>
      </div>
    )
  }

  const currentQ = gameState?.current_question ?? 0
  const questionIds = gameState?.question_ids ?? []
  const q = currentQ >= 1 && questionIds.length > 0
    ? QUESTIONS.find(q => q.id === questionIds[currentQ - 1]) ?? null
    : null
  const totalQ = questionIds.length || SELECTED_COUNT
  const answerRate = participantCount > 0 ? Math.round((answerStats.total / participantCount) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="bg-green-700 text-white rounded-2xl p-5 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-green-200 text-xs">HOST PANEL</p>
              <h1 className="text-xl font-black">IBK 예금자보호 OX퀴즈</h1>
            </div>
            <div className="text-right">
              <p className="text-green-200 text-xs">참가자</p>
              <p className="text-3xl font-black text-yellow-300">{participantCount}명</p>
            </div>
          </div>
        </div>

        {/* 게임 상태 */}
        <div className="bg-white rounded-2xl p-5 shadow mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-3 h-3 rounded-full ${
              gameState?.status === 'waiting' ? 'bg-yellow-400' :
              gameState?.status === 'question' ? 'bg-green-500 animate-pulse' :
              'bg-gray-400'
            }`} />
            <span className="font-semibold text-gray-700">
              {!gameState && '연결 중...'}
              {gameState?.status === 'waiting' && '대기 중 — 참가자를 모아주세요'}
              {gameState?.status === 'question' && `문제 ${currentQ} / ${totalQ} 진행 중`}
              {gameState?.status === 'finished' && '게임 종료'}
            </span>
          </div>

          {/* 문제 목록 */}
          {gameState?.status === 'waiting' ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-center">
              <p className="text-blue-700 font-bold text-sm">🎲 게임 시작 시 10개 문제 중 5개가 무작위로 선택됩니다</p>
            </div>
          ) : (
            <div className="space-y-2 mb-5">
              {questionIds.map((id, i) => {
                const question = QUESTIONS.find(q => q.id === id)
                if (!question) return null
                const qNum = i + 1
                const isDone = currentQ > qNum || gameState?.status === 'finished'
                const isCurrent = currentQ === qNum && gameState?.status === 'question'
                return (
                  <div key={id} className={`flex items-center gap-3 p-3 rounded-xl text-sm
                    ${isCurrent ? 'bg-green-50 border-2 border-green-500' :
                      isDone ? 'bg-gray-50' : 'bg-gray-50 opacity-40'}`}>
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                      ${isCurrent ? 'bg-green-500 text-white' :
                        isDone ? 'bg-gray-400 text-white' : 'bg-gray-200 text-gray-500'}`}>
                      {isDone ? '✓' : qNum}
                    </span>
                    <span className={`flex-1 truncate ${isCurrent ? 'text-green-800 font-semibold' : 'text-gray-600'}`}>
                      {question.question}
                    </span>
                    <span className={`ml-auto shrink-0 font-bold ${question.answer === 'O' ? 'text-green-600' : 'text-red-500'}`}>
                      {question.answer}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* 실시간 응답 현황 */}
          {gameState?.status === 'question' && q && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm mb-3">
                <span className="text-gray-600 font-medium">실시간 응답 현황</span>
                <span className="text-gray-500">{answerStats.total}명 / {participantCount}명 ({answerRate}%)</span>
              </div>
              <div className="flex gap-3 mb-3">
                <div className="flex-1 bg-green-100 rounded-xl p-3 text-center">
                  <p className="text-3xl font-black text-green-600">O</p>
                  <p className="text-xl font-bold text-green-700">{answerStats.o_count}</p>
                  <p className="text-xs text-green-500">명</p>
                </div>
                <div className="flex-1 bg-red-100 rounded-xl p-3 text-center">
                  <p className="text-3xl font-black text-red-500">X</p>
                  <p className="text-xl font-bold text-red-600">{answerStats.x_count}</p>
                  <p className="text-xs text-red-400">명</p>
                </div>
                <div className="flex-1 bg-gray-100 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-gray-500">⏰</p>
                  <p className="text-xl font-bold text-gray-600">{answerStats.timeout_count}</p>
                  <p className="text-xs text-gray-400">시간초과</p>
                </div>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${answerRate}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                5초 후 참가자 화면에 대기 화면이 표시됩니다. 설명 후 정답 공개 버튼을 눌러주세요.
              </p>
            </div>
          )}

          {/* 실시간 점수 랭킹 */}
          {gameState?.status === 'question' && rankings.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-sm font-semibold text-gray-600 mb-2">실시간 점수 현황</p>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {rankings.map((r, i) => (
                  <div key={r.nickname} className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-center shrink-0 text-xs font-bold text-gray-400">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </span>
                    <span className="flex-1 truncate text-gray-700 font-medium">{r.nickname}</span>
                    <span className="font-black text-blue-700">{r.total_points}점</span>
                    <span className="text-xs text-gray-400 shrink-0">{r.correct_count}/{totalQ}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 컨트롤 버튼 */}
          {gameState?.status === 'waiting' && (
            <div className="space-y-3">
              {/* 문제 생성 */}
              <button
                onClick={handleGenerate}
                className="w-full font-black text-lg py-3 rounded-2xl transition-all border-2 border-blue-400 text-blue-600 hover:bg-blue-50"
              >
                {gameState.question_ids?.length ? '🔀 문제 다시 생성' : '🎲 문제 생성'}
              </button>

              {/* 선택된 문제 미리보기 */}
              {gameState.question_ids?.length ? (
                <div className="bg-blue-50 rounded-xl p-3 text-sm space-y-1">
                  {gameState.question_ids.map((id, i) => {
                    const q = QUESTIONS.find(q => q.id === id)
                    return q ? (
                      <div key={id} className="flex items-start gap-2">
                        <span className="font-bold text-blue-500 shrink-0">Q{i + 1}</span>
                        <span className="text-gray-600 truncate">{q.question}</span>
                        <span className={`shrink-0 font-black ${q.answer === 'O' ? 'text-green-600' : 'text-red-500'}`}>{q.answer}</span>
                      </div>
                    ) : null
                  })}
                </div>
              ) : (
                <p className="text-center text-gray-400 text-sm py-2">문제를 먼저 생성해주세요</p>
              )}

              {/* 게임 시작 */}
              <button
                onClick={handleStart}
                disabled={advancing || participantCount === 0 || !gameState.question_ids?.length}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-black text-xl py-4 rounded-2xl transition-all"
              >
                {advancing ? '시작 중...' : participantCount === 0 ? '참가자를 기다리는 중...' : !gameState.question_ids?.length ? '문제를 먼저 생성하세요' : `▶ 게임 시작! (${participantCount}명)`}
              </button>
            </div>
          )}

          {gameState?.status === 'question' && !gameState.answer_revealed && (
            <button
              onClick={handleRevealAnswer}
              disabled={advancing}
              className="w-full text-white font-black text-xl py-5 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
              style={{ background: advancing ? '#94A3B8' : 'linear-gradient(135deg, #d97706, #f59e0b)' }}
            >
              {advancing ? '처리 중...' : '🎯 정답 공개!'}
            </button>
          )}

          {gameState?.status === 'question' && gameState.answer_revealed && (
            <button
              onClick={handleAdvance}
              disabled={advancing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-black text-lg py-4 rounded-2xl transition-all"
            >
              {advancing ? '처리 중...' :
                currentQ >= totalQ ? '✅ 결과 보기' : `▶ 다음 문제 (${currentQ + 1}번)`}
            </button>
          )}

          {gameState?.status === 'finished' && (
            <div className="text-center py-4">
              <p className="text-gray-600 font-semibold mb-3">게임이 종료되었습니다.</p>
              <a href="/ranking" target="_blank"
                className="inline-block bg-yellow-400 text-gray-900 font-black px-6 py-3 rounded-2xl">
                랭킹 페이지 열기
              </a>
            </div>
          )}
        </div>

        {/* 초기화 버튼 */}
        <button
          onClick={handleReset}
          className="w-full border-2 border-red-300 text-red-400 hover:bg-red-50 font-semibold py-3 rounded-2xl text-sm transition-all"
        >
          게임 초기화 (전체 데이터 삭제)
        </button>
      </div>
    </div>
  )
}

export default function HostPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>로딩 중...</p></div>}>
      <HostPanel />
    </Suspense>
  )
}
