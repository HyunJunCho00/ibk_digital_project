export const QUESTIONS = [
  {
    id: 1,
    question: '기업은행의 중소기업금융채권(중금채)은 채권 상품이지만 예금자보호제도에 따른 보호 대상에 해당한다.',
    answer: 'X',
    explanation: '중소기업금융채권(중금채)은 채권 상품으로, 예금자보호법상 보호 대상(예금·적금·부금·예탁금 등)에 해당하지 않습니다. 채권은 예금자보호제도의 보호 대상에서 제외됩니다.',
  },
  {
    id: 2,
    question: '보험사고 발생 시 최종적으로 지급되는 예금보험금의 이자 계산 방식은 약정이율과 공사 공시이율 중 더 낮은 금리를 적용한다.',
    answer: 'O',
    explanation: '예금보험금 지급 시 이자는 약정이율과 예금보험공사 공시이율 중 더 낮은 금리를 적용하여 계산합니다.',
  },
  {
    id: 3,
    question: "예금자보호법에 따른 예금보호한도는 1인당 '원금'에 한정하여 최고 1억 원까지다.",
    answer: 'X',
    explanation: '원금뿐만 아니라 소정의 이자(약정이율과 공사 공시이율 중 낮은 금리로 계산)를 합산하여 1억 원까지 보호합니다.',
  },
  {
    id: 4,
    question: '예금자보호제도에 따라 보호받을 수 있는 예금 보호 한도는 전 금융기관 합산 총 1억 원이다.',
    answer: 'X',
    explanation: '예금 보호 한도는 금융기관별로 각각 1억 원이 적용됩니다. 전 금융기관 합산이 아닌, 동일 금융기관 내에서 1인당 1억 원이 기준입니다.',
  },
  {
    id: 5,
    question: '2026년 3월 중 보험사고가 발생했을 때 은행 업권에 적용되는 공사 공시이율은 2.22%이다.',
    answer: 'O',
    explanation: '2026년 3월 예금보험공사가 공시한 은행 업권의 공사 공시이율은 연 2.22%입니다.',
  },
]

export const QUESTION_TIME_MS = 5000
export const MAX_POINTS = 1000

export function calcPoints(responseTimeMs: number): number {
  const t = Math.max(0, Math.min(responseTimeMs, QUESTION_TIME_MS))
  const ratio = 1 - t / QUESTION_TIME_MS
  return Math.round(MAX_POINTS * ratio * ratio)
}
