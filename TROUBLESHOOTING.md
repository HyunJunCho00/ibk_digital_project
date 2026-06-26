# IBK OX퀴즈 트러블슈팅 가이드

> 160명 규모 이벤트 운영 기준

---

## 발생한 문제 & 원인 & 조치

### 1. 첫 문제 접속 시 전체 딜레이 (실제 발생 - 124명)

**증상**
- 게임 시작 시 모든 참가자 화면이 버벅이다가 2문제째부터 정상화

**원인**
- 참가자 전원이 동시에 `/game` 페이지에 접속하면 `init()` 함수가 일제히 실행됨
- DB 쿼리 124개 + Realtime 구독 신청 124개가 동시에 Supabase로 몰림
- 2문제부터 정상인 이유: 구독이 한 번 완료되면 이후엔 Websocket 이벤트만 받으면 되어 DB 부하 없음

**조치 (적용됨)**
```typescript
// app/game/page.tsx - init() 함수 상단에 추가
await new Promise(r => setTimeout(r, Math.random() * 2000))
```
- 최대 2초 랜덤 딜레이로 124명의 첫 DB 조회를 시간 분산

---

### 2. screen 페이지 답변 폭탄 (잠재 위험)

**증상**
- 미발생 (사전 발견)

**원인**
- `screen/page.tsx`가 `answers` 테이블 INSERT 이벤트마다 `fetchRankings()` 호출
- 160명 동시 답변 시 → 160 × 3쿼리 = **480 DB 쿼리** 수초 내 폭발

**조치 (적용됨)**
```typescript
// app/screen/page.tsx - 500ms 디바운스 추가
const debouncedFetchRankings = useCallback((qNum?: number) => {
  if (rankDebounceRef.current) clearTimeout(rankDebounceRef.current)
  rankDebounceRef.current = setTimeout(() => fetchRankings(qNum), 500)
}, [fetchRankings])
```

---

## Supabase 무료 플랜 한도 (160명 기준)

| 항목 | 한도 | 실제 사용량 | 여유 |
|------|------|------------|------|
| Realtime 동시 연결 | 200개 | ~162개 | 38개 |
| DB 커넥션 | PgBouncer 풀러 사용 | 문제없음 | - |
| 쿼리 수 (5문제 전체) | 무제한 | ~5,500개 | 충분 |

---

## 이벤트 당일 운영 체크리스트

### 게임 시작 전 (필수)
- [ ] Supabase 대시보드 → `participants` 테이블 전체 삭제
- [ ] Supabase 대시보드 → `answers` 테이블 전체 삭제
- [ ] `game_state` 테이블 → `status: waiting`, `answer_revealed: false`, `current_question: 0` 확인
- [ ] screen 페이지(빔프로젝터) 미리 열어두기
- [ ] 참가자 입장 완료 후 screen에서 참가자 수 확인하고 시작

### 참가자 공지 사항
- 폰 화면 꺼짐 방지 설정 (특히 iOS)
- 퀴즈 중 새로고침 금지
- 답변은 1회만 (수정 불가)

### 게임 중 호스트 순서
1. 참가자 전원 입장 대기 (screen에서 참가자 수 확인)
2. 문제 시작
3. 타이머 종료 후 정답 공개 버튼 클릭
4. 랭킹 확인 후 다음 문제

---

## 알려진 한계

| 항목 | 내용 |
|------|------|
| 닉네임 중복 | DB unique 제약 없음 → 같은 닉네임 2명이면 랭킹 집계 오류 가능 |
| 모바일 화면 잠금 | iOS Safari에서 화면 꺼지면 타이머 멈춤 |
| Realtime 연결 초과 | 200명 초과 시 일부 참가자 실시간 이벤트 수신 불가 |
| 새로고침 시 재접속 딜레이 | init() jitter로 최대 2초 대기 발생 (의도된 동작) |

---

## Vercel 배포 방법 (이벤트 후 설정)

1. vercel.com → Import Git Repository → `ibk_digital_project` 선택
2. Environment Variables 추가:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy → 이후 main 브랜치 push 시 자동 배포
