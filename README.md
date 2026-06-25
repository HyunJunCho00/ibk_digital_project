# IBK 예금자보호 OX퀴즈

IBK기업은행 예금자보호제도 교육을 위한 실시간 OX퀴즈 이벤트 플랫폼

---

## 사이트 URL

| 화면 | URL | 대상 |
|------|-----|------|
| 참가자 로비 | `https://ibk-digital-project.vercel.app` | 참가자 전원 |
| 퀴즈 화면 | `https://ibk-digital-project.vercel.app/game` | 자동 이동 |
| 프로젝터 화면 | `https://ibk-digital-project.vercel.app/screen` | 큰 화면 (선택) |
| 관리자 패널 | `https://ibk-digital-project.vercel.app/host?key=ibk2025` | 호스트 전용 |
| 최종 랭킹 | `https://ibk-digital-project.vercel.app/ranking` | 자동 이동 |

---

## 진행 순서

```
1. 호스트: /host?key=ibk2025 접속
2. (선택) 프로젝터에 /screen 띄워두기
3. 참가자들에게 메인 URL 공유 → 닉네임 입력 후 대기
4. 호스트: 참가자 모두 모이면 "게임 시작" 버튼 클릭
5. 자동으로 5문제 진행 (문제당 5초)
6. 호스트: 각 문제마다 "다음 문제" 클릭
7. 5문제 종료 후 "결과 보기" 클릭 → 전원 랭킹 화면 자동 이동
```

---

## 점수 규칙

- 정답 수가 많을수록 높은 순위
- 정답 수가 같으면 더 빠르게 누른 사람이 높은 순위
- 1초 내 정답: 1000점 / 5초 내 정답: 200점 / 오답·시간초과: 0점

---

## 데이터 흐름

| 상황 | 데이터 |
|------|--------|
| 참가자 닉네임 입력 | participants 테이블에 저장 |
| 퀴즈 답변 | answers 테이블에 저장 |
| 게임 초기화 | 전체 삭제 → 새 게임 가능 |
| 참가자 "처음으로" 클릭 | localStorage만 초기화 (DB 유지) |

게임을 다시 시작하려면 `/host?key=ibk2025` 하단 **"게임 초기화"** 버튼 클릭

---

## 환경 변수 (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_HOST_KEY=ibk2025
```

Vercel 재배포 시: `npx vercel --prod`

---

## 기술 스택

- **Frontend**: Next.js 16 + Tailwind CSS
- **Database**: Supabase (PostgreSQL + Realtime)
- **Deploy**: Vercel
