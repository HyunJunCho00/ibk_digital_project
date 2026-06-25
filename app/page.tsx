'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import type { GameState } from '@/lib/supabase'

type LobbyState = 'form' | 'waiting'

export default function LobbyPage() {
  const router = useRouter()
  const [lobbyState, setLobbyState] = useState<LobbyState>('form')
  const [nickname, setNickname] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [participantCount, setParticipantCount] = useState(0)
  const [myNickname, setMyNickname] = useState('')

  useEffect(() => {
    async function restoreSession() {
      const existingSession = localStorage.getItem('ibk_session_id')
      const existingNick = localStorage.getItem('ibk_nickname')
      if (existingSession && existingNick) {
        // DB에 실제로 존재하는지 확인 (게임 리셋 시 삭제됨)
        const { data } = await supabase
          .from('participants')
          .select('id')
          .eq('session_id', existingSession)
          .maybeSingle()
        if (data) {
          setMyNickname(existingNick)
          setLobbyState('waiting')
        } else {
          // 유효하지 않은 세션 → 초기화
          localStorage.removeItem('ibk_session_id')
          localStorage.removeItem('ibk_nickname')
        }
      }
    }
    restoreSession()
    fetchCount()

    const channel = supabase
      .channel('lobby-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants' }, () => {
        setParticipantCount((c) => c + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' }, (payload) => {
        const gs = payload.new as GameState
        if (gs.status === 'question') router.push('/game')
        if (gs.status === 'finished') router.push('/ranking')
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [router])

  async function fetchCount() {
    const { count } = await supabase.from('participants').select('*', { count: 'exact', head: true })
    setParticipantCount(count ?? 0)
  }

  async function handleJoin() {
    const trimmed = nickname.trim()
    if (!trimmed) { setError('닉네임을 입력해주세요.'); return }
    if (trimmed.length > 10) { setError('10자 이내로 입력해주세요.'); return }
    setJoining(true)
    setError('')

    const sessionId = crypto.randomUUID()
    const { error: e } = await supabase.from('participants').insert({ session_id: sessionId, nickname: trimmed })
    if (e) {
      setError(e.code === '23505' ? '이미 사용 중인 닉네임이에요.' : '오류가 발생했어요. 다시 시도해주세요.')
      setJoining(false)
      return
    }
    localStorage.setItem('ibk_session_id', sessionId)
    localStorage.setItem('ibk_nickname', trimmed)
    setMyNickname(trimmed)
    setLobbyState('waiting')
    setJoining(false)
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* 왼쪽: 교수님 이미지 */}
      <div className="relative md:w-[55%] h-56 sm:h-72 md:h-auto overflow-hidden" style={{ background: '#001A4D', minHeight: '220px' }}>
        <Image src="/profess.png" alt="예금자보호제도 강의" fill className="object-cover opacity-90" priority style={{ objectPosition: '50% 10%' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, transparent 60%, #001A4D)' }} />
        <div className="absolute inset-0 md:hidden" style={{ background: 'linear-gradient(to top, #001A4D 10%, transparent 50%)' }} />
        {/* 우측 하단 AI 워터마크 가리기 */}
        <div className="absolute bottom-0 right-0 w-24 h-24" style={{ background: 'radial-gradient(ellipse at bottom right, #001A4D 50%, transparent 100%)' }} />
        <div className="absolute bottom-6 left-6 md:bottom-10 md:left-10">
          <span className="text-xs font-black px-3 py-1 rounded-full" style={{ background: '#FFB300', color: '#001A4D' }}>
            IBK 기업은행 수신교육
          </span>
          <h2 className="text-white text-2xl md:text-4xl font-black mt-2 drop-shadow-lg leading-tight">
            예금자<br className="hidden md:block" />보호제도
          </h2>
        </div>
      </div>

      {/* 오른쪽: 참가 폼 */}
      <div className="md:w-[45%] flex flex-col items-center justify-center px-6 py-10 md:py-0"
        style={{ background: 'linear-gradient(160deg, #003087 0%, #001A4D 100%)' }}>

        {lobbyState === 'form' ? (
          /* ── 참가 폼 ── */
          <div className="w-full max-w-sm slide-up">
            {/* 타이틀 */}
            <div className="text-center mb-8">
              <div className="mx-auto mb-3 w-24 h-24 rounded-full bg-white flex items-center justify-center shadow-xl overflow-hidden">
                <Image src="/인사.png" alt="기은센" width={88} height={88} className="object-contain" />
              </div>
              <p className="text-blue-300 text-xs tracking-[0.2em] font-semibold mb-1">IBK 기업은행</p>
              <h1 className="text-white text-4xl font-black leading-tight">
                예금자보호
              </h1>
              <div className="inline-block text-3xl font-black px-5 py-1 rounded-full mt-2"
                style={{ background: '#FFB300', color: '#001A4D' }}>
                OX퀴즈
              </div>
              <p className="text-blue-200 text-xs mt-3">5문제 · 문제당 5초 · 빠를수록 높은 점수!</p>
            </div>

            {/* 입력 카드 */}
            <div className="bg-white rounded-3xl p-6 shadow-2xl">
              {/* 현재 참가자 */}
              <div className="flex items-center justify-between rounded-2xl px-4 py-3 mb-5"
                style={{ background: '#EEF3FF' }}>
                <span className="text-sm font-medium" style={{ color: '#003087' }}>현재 참가자</span>
                <span className="font-black text-xl" style={{ color: '#003087' }}>{participantCount}명</span>
              </div>

              <label className="block text-sm font-bold mb-2" style={{ color: '#003087' }}>닉네임</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => { setNickname(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="ex) 금융왕, 홍길동 (최대 10자)"
                maxLength={10}
                className="w-full border-2 rounded-2xl px-4 py-3 text-gray-800 focus:outline-none mb-1 text-base"
                style={{ borderColor: error ? '#EF4444' : '#CBD5E1' }}
              />
              {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
              <p className="text-gray-400 text-xs mb-5">중복 닉네임은 사용할 수 없어요</p>

              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full text-white font-black text-xl py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                style={{ background: joining ? '#94A3B8' : 'linear-gradient(135deg, #003087, #0055B8)' }}
              >
                {joining ? '참가 중...' : '참가하기!'}
              </button>
            </div>

            {/* 점수 규칙 */}
            <div className="mt-4 rounded-2xl px-5 py-4" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <p className="text-xs font-bold mb-2" style={{ color: '#FFB300' }}>점수 규칙</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-blue-200">즉시 정답</span><span className="text-white font-bold">1000점</span></div>
                <div className="flex justify-between"><span className="text-blue-200">2.5초 내 정답</span><span className="text-white font-bold">250점</span></div>
                <div className="flex justify-between"><span className="text-blue-200">오답 / 시간초과</span><span className="text-white font-bold">0점</span></div>
              </div>
            </div>
          </div>

        ) : (
          /* ── 대기 화면 ── */
          <div className="w-full max-w-sm text-center slide-up">
            <div className="relative mb-6">
              <div className="mx-auto w-32 h-32 rounded-full bg-white flex items-center justify-center shadow-2xl overflow-hidden">
                <Image src="/응원.png" alt="기은센" width={120} height={120} className="object-contain" />
              </div>
              {/* 펄스 링 */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-28 h-28 rounded-full animate-ping opacity-20" style={{ background: '#FFB300' }} />
              </div>
            </div>

            <h2 className="text-white text-2xl font-black mb-2">참가 완료!</h2>
            <p className="text-blue-200 text-sm mb-6">관리자가 게임을 시작할 때까지 기다려주세요</p>

            {/* 내 닉네임 */}
            <div className="rounded-2xl px-5 py-3 mb-4 inline-block" style={{ background: 'rgba(255,179,0,0.15)', border: '1px solid rgba(255,179,0,0.4)' }}>
              <p className="text-xs text-blue-300 mb-0.5">내 닉네임</p>
              <p className="text-xl font-black" style={{ color: '#FFB300' }}>{myNickname}</p>
            </div>

            {/* 참가자 현황 */}
            <div className="bg-white/10 rounded-2xl px-5 py-4 mb-6">
              <p className="text-blue-200 text-xs mb-1">현재까지 참가한 인원</p>
              <p className="text-white font-black text-4xl">{participantCount}<span className="text-lg text-blue-300 ml-1">명</span></p>
            </div>

            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-blue-300 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-blue-400 text-xs mt-3">게임이 시작되면 자동으로 이동합니다</p>
          </div>
        )}
      </div>
    </div>
  )
}
