'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase, fetchCurrentRankings } from '@/lib/supabase'
import { QUESTIONS, SELECTED_COUNT } from '@/lib/questions'
import type { RankEntry } from '@/lib/supabase'

export default function RankingPage() {
  const router = useRouter()
  const [rankings, setRankings] = useState<RankEntry[]>([])
  const [myNickname, setMyNickname] = useState('')
  const [isFinished, setIsFinished] = useState(false)
  const [showTop3, setShowTop3] = useState(false)
  const [playedQuestions, setPlayedQuestions] = useState<typeof QUESTIONS>([QUESTIONS[0]])

  async function loadRankings() {
    setRankings(await fetchCurrentRankings())
  }

  useEffect(() => {
    const nick = localStorage.getItem('ibk_nickname') ?? ''
    setMyNickname(nick)

    async function init() {
      await loadRankings()
      const { data: gs } = await supabase.from('game_state').select('status, question_ids').eq('id', 1).single()
      const finished = gs?.status === 'finished'
      setIsFinished(finished)
      if (finished) setTimeout(() => setShowTop3(true), 400)
      if (gs?.question_ids?.length) {
        setPlayedQuestions(QUESTIONS.filter(q => gs.question_ids!.includes(q.id))
          .sort((a, b) => gs.question_ids!.indexOf(a.id) - gs.question_ids!.indexOf(b.id)))
      }
    }
    init()

    const channel = supabase.channel('ranking-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, loadRankings)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        if (payload.new.status === 'finished') {
          setIsFinished(true)
          setTimeout(() => setShowTop3(true), 400)
        }
        if (payload.new.status === 'question') router.push('/game')
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [router])

  const top3 = rankings.slice(0, 3)
  const rest = rankings.slice(3)
  const myRank = rankings.findIndex((r) => r.nickname === myNickname) + 1
  const myEntry = rankings.find((r) => r.nickname === myNickname)

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #003087 0%, #001A4D 100%)' }}>

      {/* 헤더 */}
      <div className="text-center pt-8 pb-3 px-4">
        {isFinished ? (
          <div className="slide-up">
            <div className="mx-auto w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-xl overflow-hidden mb-3">
              <Image src="/축하.png" alt="" width={76} height={76} className="object-contain" />
            </div>
            <h1 className="text-yellow-400 text-3xl font-black">최종 결과 발표!</h1>
          </div>
        ) : (
          <div>
            <div className="mx-auto w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg overflow-hidden mb-3">
              <Image src="/응원.png" alt="" width={60} height={60} className="object-contain" />
            </div>
            <h1 className="text-white text-2xl font-black">실시간 순위</h1>
            <p className="text-blue-300 text-sm animate-pulse mt-1">게임 진행 중 · 실시간 업데이트</p>
          </div>
        )}

        {/* 내 순위 뱃지 */}
        {myRank > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ background: 'rgba(255,179,0,0.15)', border: '1px solid rgba(255,179,0,0.4)' }}>
            <span className="text-blue-200 text-sm">내 순위</span>
            <span className="font-black text-lg" style={{ color: '#FFB300' }}>{myRank}위</span>
            {myEntry && <span className="text-white/50 text-xs">· {myEntry.total_points}점</span>}
          </div>
        )}
      </div>

      {/* Top 3 시상대 — 게임 종료 후만 표시 */}
      {isFinished && showTop3 && top3.length > 0 && (
        <div className="px-4 mb-4">
          <div className="flex items-end justify-center gap-2" style={{ height: '11rem' }}>

            {/* 2위 */}
            {top3[1] ? (
              <div className="flex-1 flex flex-col items-center slide-up" style={{ animationDelay: '0.2s' }}>
                <div className="w-10 h-10 rounded-full bg-white overflow-hidden mb-1 shadow">
                  <Image src="/최고.png" alt="" width={40} height={40} className="object-contain" />
                </div>
                <span className="text-2xl">🥈</span>
                <div className={`w-full rounded-t-xl px-2 py-2 text-center flex flex-col justify-end
                  ${top3[1].nickname === myNickname ? 'ring-2 ring-yellow-400' : ''}
                  bg-gradient-to-b from-gray-400/30 to-gray-400/10 border border-gray-400/20`}
                  style={{ height: '5rem' }}>
                  <p className="text-white font-black text-xs truncate">{top3[1].nickname}</p>
                  <p className="font-black text-sm" style={{ color: '#FFB300' }}>{top3[1].total_points}점</p>
                </div>
              </div>
            ) : <div className="flex-1" />}

            {/* 1위 */}
            {top3[0] && (
              <div className="flex-1 flex flex-col items-center slide-up" style={{ animationDelay: '0.4s' }}>
                <div className="w-12 h-12 rounded-full bg-white overflow-hidden mb-1 shadow-lg">
                  <Image src="/최고.png" alt="" width={48} height={48} className="object-contain" />
                </div>
                <span className="text-3xl">🥇</span>
                <div className={`w-full rounded-t-xl px-2 py-2 text-center flex flex-col justify-end
                  ${top3[0].nickname === myNickname ? 'ring-2 ring-yellow-400' : ''}
                  bg-gradient-to-b from-yellow-400/40 to-yellow-400/10 border border-yellow-400/30`}
                  style={{ height: '6.5rem' }}>
                  <p className="font-black text-xs truncate" style={{ color: '#FFB300' }}>{top3[0].nickname}</p>
                  <p className="font-black text-base" style={{ color: '#FFB300' }}>{top3[0].total_points}점</p>
                  <p className="text-white/40 text-xs">{top3[0].correct_count}/{SELECTED_COUNT} 정답</p>
                </div>
              </div>
            )}

            {/* 3위 */}
            {top3[2] ? (
              <div className="flex-1 flex flex-col items-center slide-up" style={{ animationDelay: '0.1s' }}>
                <div className="w-10 h-10 rounded-full bg-white overflow-hidden mb-1 shadow">
                  <Image src="/응원.png" alt="" width={40} height={40} className="object-contain" />
                </div>
                <span className="text-2xl">🥉</span>
                <div className={`w-full rounded-t-xl px-2 py-2 text-center flex flex-col justify-end
                  ${top3[2].nickname === myNickname ? 'ring-2 ring-yellow-400' : ''}
                  bg-gradient-to-b from-orange-400/30 to-orange-400/10 border border-orange-400/20`}
                  style={{ height: '3.5rem' }}>
                  <p className="text-white font-black text-xs truncate">{top3[2].nickname}</p>
                  <p className="font-black text-sm" style={{ color: '#FFB300' }}>{top3[2].total_points}점</p>
                </div>
              </div>
            ) : <div className="flex-1" />}
          </div>
        </div>
      )}

      {/* 전체 순위 리스트 */}
      <div className="px-4 pb-4">
        <div className="rounded-2xl overflow-hidden border border-white/10">
          <div className="px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <p className="text-white/50 text-xs font-semibold">전체 순위 ({rankings.length}명)</p>
          </div>
          {rankings.length === 0 ? (
            <div className="py-8 text-center text-white/30">
              <p className="text-sm">아직 참가자가 없어요</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {rankings.map((entry, i) => {
                const rank = i + 1
                const isMe = entry.nickname === myNickname
                return (
                  <div key={entry.nickname}
                    className="flex items-center px-4 py-3"
                    style={{ background: isMe ? 'rgba(255,179,0,0.1)' : '' }}>
                    <div className="w-8 shrink-0 text-center">
                      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉'
                        : <span className="text-white/40 text-sm font-bold">{rank}</span>}
                    </div>
                    <div className="flex-1 min-w-0 ml-2">
                      <p className="font-bold text-sm truncate" style={{ color: isMe ? '#FFB300' : 'rgba(255,255,255,0.85)' }}>
                        {entry.nickname}{isMe && ' 👈'}
                      </p>
                      <p className="text-white/30 text-xs">{entry.correct_count}/{SELECTED_COUNT} 정답</p>
                    </div>
                    <p className="font-black text-base shrink-0 ml-2"
                      style={{ color: rank <= 3 ? '#FFB300' : 'rgba(255,255,255,0.6)' }}>
                      {entry.total_points}점
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 문제 해설 — 종료 후만 */}
        {isFinished && (
          <div className="mt-4 rounded-2xl p-4 border border-white/10 slide-up"
            style={{ background: 'rgba(255,255,255,0.07)' }}>
            <p className="font-bold text-sm mb-3" style={{ color: '#FFB300' }}>문제 정답 해설</p>
            <div className="space-y-3">
              {playedQuestions.map((q) => (
                <div key={q.id} className="flex items-start gap-2">
                  <span className={`shrink-0 text-xs font-black px-2 py-0.5 rounded-full mt-0.5
                    ${q.answer === 'O' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                    {q.answer}
                  </span>
                  <div>
                    <p className="text-white/60 text-xs leading-relaxed">{q.question}</p>
                    <p className="text-blue-300 text-xs mt-0.5">{q.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isFinished && (
          <div className="mt-5 text-center pb-8">
            <button
              onClick={() => {
                localStorage.removeItem('ibk_session_id')
                localStorage.removeItem('ibk_nickname')
                router.push('/')
              }}
              className="text-white/40 text-sm border border-white/10 px-5 py-2 rounded-full"
            >
              처음으로 돌아가기
            </button>
            <p className="text-white/20 text-xs mt-2">호스트가 게임을 초기화해야 새 게임을 시작할 수 있어요</p>
          </div>
        )}

        <p className="text-center text-white/20 text-xs py-4">powered by IBK i-ONE Bank</p>
      </div>
    </div>
  )
}
