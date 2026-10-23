import { AppError, CHANNELS } from './domain.mjs';

const option = (value, label, description) => ({
  value,
  label,
  ...(description ? { description } : {}),
});
export const PLAN_STEPS = [
  { id: 'purpose', label: '목적과 목표' },
  { id: 'audience', label: '독자와 필요' },
  { id: 'message', label: '핵심 메시지' },
  { id: 'action', label: '행동과 채널' },
  { id: 'structure', label: '구성과 표현' },
  { id: 'execution', label: '실행과 점검' },
];
export const PLAN_OPTIONS = {
  purpose: [
    option('awareness', '알리기'),
    option('education', '이해·도움'),
    option('trust', '신뢰·관계'),
    option('action', '행동 유도'),
    option('expression', '탐구·표현'),
  ],
  audience: [
    option('이 주제를 처음 접하는 사람', '처음 접하는 사람'),
    option('이미 관심을 가진 사람', '관심을 가진 사람'),
    option('비슷한 고민을 가진 동료', '비슷한 고민의 동료'),
    option('이용을 고민하는 잠재 고객', '잠재 고객'),
    option('이미 이용 중인 고객', '기존 고객'),
  ],
  awareness: [
    option('unaware', '아직 주제를 잘 모름'),
    option('aware', '문제·필요를 알고 있음'),
    option('considering', '해결 방법을 비교 중'),
    option('experienced', '이미 경험하고 있음'),
  ],
  need: [
    option('핵심을 빠르게 이해하고 싶다', '빠른 이해'),
    option('구체적인 해결 방법이 필요하다', '해결 방법'),
    option('선택할 판단 기준이 필요하다', '판단 기준'),
    option('비슷한 경험과 공감이 필요하다', '경험·공감'),
    option('새로운 관점으로 생각하고 싶다', '새로운 관점'),
  ],
  angle: [
    option('문제 해결', '문제 해결'),
    option('경험과 배운 점', '경험과 배운 점'),
    option('비교와 판단 기준', '비교·판단'),
    option('핵심 정보 정리', '핵심 정리'),
    option('질문과 새로운 관점', '질문·관점'),
  ],
  action: [
    option('핵심 내용을 기억하기', '기억하기'),
    option('필요할 때 다시 읽기 위해 저장하기', '저장하기'),
    option('직접 한 가지 방법을 실행하기', '실행하기'),
    option('질문이나 경험을 댓글로 남기기', '대화하기'),
    option('자세한 내용을 확인하기', '더 알아보기'),
  ],
  format: [
    option('article', '해설·정보형'),
    option('checklist', '체크리스트'),
    option('story', '경험·스토리'),
    option('comparison', '비교·선택 가이드'),
    option('opinion', '질문·에세이'),
  ],
  tone: [
    option('friendly', '친근하게'),
    option('professional', '전문적으로'),
    option('concise', '간결하게'),
  ],
  formula: [
    option('information', '정보 전달형'),
    option('pas', 'PAS'),
    option('aida', 'AIDA'),
    option('story', '스토리텔링'),
    option('custom', '나만의 공식'),
  ],
  length: [option('short', '짧게'), option('medium', '보통'), option('long', '길게')],
  timeframe: [
    option('7d', '발행 후 7일'),
    option('14d', '발행 후 14일'),
    option('30d', '발행 후 30일'),
    option('next_session', '다음 검토 시간'),
  ],
  trigger: [
    option('다음 작업 시간을 시작하면', '다음 작업을 시작하면'),
    option('필요한 자료를 확인하면', '자료를 확인하면'),
    option('독자의 질문을 정리하면', '질문을 정리하면'),
    option('초안 작성을 마치면', '초안을 마치면'),
  ],
  nextStep: [
    option('핵심 메시지를 기준으로 개요를 작성한다', '개요 작성'),
    option('주장에 필요한 근거를 확인한다', '근거 확인'),
    option('기획안을 바탕으로 첫 초안을 작성한다', '첫 초안 작성'),
    option('초안을 독자의 관점에서 다시 읽는다', '독자 관점으로 검토'),
  ],
};
export const PLAN_METRICS = {
  awareness: [
    option('reach', '도달·조회 확인'),
    option('recall', '핵심 메시지 회상 확인'),
    option('profile', '프로필·소개 방문 확인'),
    option('custom', '직접 기준 정하기'),
  ],
  education: [
    option('understanding', '이해 여부 확인'),
    option('saves', '저장·재방문 확인'),
    option('attempts', '실행 경험 확인'),
    option('custom', '직접 기준 정하기'),
  ],
  trust: [
    option('replies', '질문·경험 공유 확인'),
    option('returning', '다시 찾아오는 반응 확인'),
    option('feedback', '신뢰·공감 피드백 확인'),
    option('custom', '직접 기준 정하기'),
  ],
  action: [
    option('clicks', '자세히 보기 클릭 확인'),
    option('signups', '신청·구독 확인'),
    option('enquiries', '문의 확인'),
    option('custom', '직접 기준 정하기'),
  ],
  expression: [
    option('finished', '메시지를 담은 초안 완성'),
    option('reviewed', '다른 관점으로 재검토'),
    option('learning', '새롭게 발견한 점 기록'),
    option('custom', '직접 기준 정하기'),
  ],
};
export const PLAN_CHECKS = [
  { id: 'specific', label: '목적과 확인 기준이 분명해요' },
  { id: 'audience', label: '독자의 필요와 메시지가 연결돼요' },
  { id: 'evidence', label: '근거와 불확실한 부분을 구분했어요' },
  { id: 'feasible', label: '다음 행동을 실행할 수 있어요' },
];
export const EMPTY_PLAN_FIELDS = {
  topic: '',
  purpose: '',
  metric: '',
  target: '',
  timeframe: '',
  audience: '',
  awareness: '',
  need: '',
  message: '',
  angle: '',
  evidence: '',
  objection: '',
  action: '',
  channels: [],
  format: '',
  tone: 'friendly',
  formula: '',
  customFormula: '',
  length: 'medium',
  trigger: '',
  nextStep: '',
  checks: { specific: false, audience: false, evidence: false, feasible: false },
};
const LIMITS = {
  topic: 160,
  metric: 300,
  target: 300,
  timeframe: 300,
  audience: 300,
  need: 1000,
  message: 1000,
  angle: 300,
  evidence: 6000,
  objection: 1000,
  action: 500,
  customFormula: 3000,
  trigger: 500,
  nextStep: 500,
};
const ENUM_FIELDS = ['purpose', 'awareness', 'format', 'tone', 'formula', 'length'];
const FIELD_LABELS = {
  topic: '주제',
  purpose: '목적',
  metric: '확인 기준',
  target: '목표 또는 판단 기준',
  timeframe: '확인 시점',
  audience: '독자',
  awareness: '독자의 이해 단계',
  need: '독자의 필요',
  message: '핵심 메시지',
  angle: '접근 방식',
  evidence: '근거·확인할 자료',
  objection: '예상 질문',
  action: '독자의 다음 행동',
  format: '콘텐츠 형식',
  tone: '말투',
  formula: '구성 공식',
  customFormula: '나만의 공식',
  length: '분량',
  trigger: '작업을 시작할 상황',
  nextStep: '다음 작업',
};
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireRecord(value, label) {
  if (!isRecord(value)) throw new AppError(`${label} 형식이 올바르지 않아요.`);
}
export function validatePlanFields(input, previous = EMPTY_PLAN_FIELDS) {
  requireRecord(input, '기획');
  const fields = { ...previous, channels: [...previous.channels], checks: { ...previous.checks } };
  for (const [key, limit] of Object.entries(LIMITS)) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || input[key].length > limit)
      throw new AppError(
        `${FIELD_LABELS[key]} 항목은 ${limit.toLocaleString()}자 이내로 입력해 주세요.`,
      );
    fields[key] = input[key].trim();
  }
  for (const key of ENUM_FIELDS) {
    if (input[key] === undefined) continue;
    if (
      typeof input[key] !== 'string' ||
      (input[key] !== '' && !PLAN_OPTIONS[key].some((item) => item.value === input[key]))
    )
      throw new AppError(`${FIELD_LABELS[key]} 선택을 확인해 주세요.`);
    fields[key] = input[key];
  }
  if (input.channels !== undefined) {
    if (
      !Array.isArray(input.channels) ||
      input.channels.some((channel) => !CHANNELS.includes(channel)) ||
      input.channels.length > 3
    )
      throw new AppError('기획의 발행 채널을 확인해 주세요.');
    fields.channels = [...new Set(input.channels)];
  }
  if (input.checks !== undefined) {
    requireRecord(input.checks, '기획 확인 항목');
    for (const { id } of PLAN_CHECKS) {
      if (input.checks[id] === undefined) continue;
      if (typeof input.checks[id] !== 'boolean')
        throw new AppError('기획 확인 항목을 다시 선택해 주세요.');
      fields.checks[id] = input.checks[id];
    }
  }
  return fields;
}
function validStep(step) {
  if (!Number.isInteger(step) || step < 0 || step >= PLAN_STEPS.length)
    throw new AppError('기획 단계를 확인해 주세요.');
  return step;
}
export function createPlan(input = {}) {
  requireRecord(input, '기획');
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    revision: 1,
    status: 'draft',
    step: validStep(input.step ?? 0),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    fields: validatePlanFields(input.fields ?? {}),
  };
}
export function updatePlan(plan, input) {
  requireRecord(input, '기획');
  const fields = validatePlanFields(input.fields ?? {}, plan.fields);
  const step = validStep(input.step ?? plan.step);
  const changed = JSON.stringify(fields) !== JSON.stringify(plan.fields);
  if (!changed && step === plan.step) return plan;
  const substantiveChange = Object.keys(fields).some(
    (key) => key !== 'checks' && JSON.stringify(fields[key]) !== JSON.stringify(plan.fields[key]),
  );
  if (substantiveChange && Object.values(plan.fields.checks).some(Boolean))
    fields.checks = { ...EMPTY_PLAN_FIELDS.checks };
  return {
    ...plan,
    fields,
    step,
    status: changed ? 'draft' : plan.status,
    completedAt: changed ? null : plan.completedAt,
    updatedAt: new Date().toISOString(),
  };
}
export function planReadiness(plan) {
  const f = plan.fields;
  const allMetrics = new Set(
    Object.values(PLAN_METRICS)
      .flat()
      .map((item) => item.value),
  );
  const metricCompatible =
    !allMetrics.has(f.metric) || PLAN_METRICS[f.purpose]?.some((item) => item.value === f.metric);
  const missing = [
    [
      ...(!f.topic ? ['주제'] : []),
      ...(!f.purpose ? ['목적'] : []),
      ...(!f.metric || !metricCompatible ? ['목적에 맞는 확인 기준'] : []),
      ...(f.metric === 'custom' && !f.target ? ['직접 정한 확인 기준'] : []),
      ...(!f.timeframe ? ['확인 시점'] : []),
    ],
    [
      ...(!f.audience ? ['독자'] : []),
      ...(!f.awareness ? ['독자의 이해 단계'] : []),
      ...(!f.need ? ['독자의 필요'] : []),
    ],
    [
      ...(!f.message ? ['핵심 메시지'] : []),
      ...(!f.angle ? ['접근 방식'] : []),
      ...(!f.evidence ? ['근거 또는 확인할 자료'] : []),
      ...(!f.objection ? ['예상 질문'] : []),
    ],
    [...(!f.action ? ['독자의 다음 행동'] : []), ...(!f.channels.length ? ['발행 채널'] : [])],
    [
      ...(!f.format ? ['콘텐츠 형식'] : []),
      ...(!f.tone ? ['말투'] : []),
      ...(!f.formula ? ['구성 공식'] : []),
      ...(f.formula === 'custom' && !f.customFormula ? ['나만의 공식'] : []),
      ...(!f.length ? ['분량'] : []),
    ],
    [
      ...(!f.trigger ? ['작업을 시작할 상황'] : []),
      ...(!f.nextStep ? ['다음 작업'] : []),
      ...PLAN_CHECKS.filter(({ id }) => !f.checks[id]).map(({ label }) => label),
    ],
  ];
  const steps = PLAN_STEPS.map((step, index) => ({
    ...step,
    complete: missing[index].length === 0,
    missing: missing[index],
  }));
  const completedSteps = steps.filter((step) => step.complete).length;
  return {
    steps,
    complete: completedSteps === PLAN_STEPS.length,
    missing: missing.flat(),
    completedSteps,
    totalSteps: PLAN_STEPS.length,
    progress: Math.round((completedSteps / PLAN_STEPS.length) * 100),
  };
}
export function completePlan(plan) {
  const readiness = planReadiness(plan);
  if (!readiness.complete)
    throw new AppError(`기획을 완료하려면 확인해 주세요: ${readiness.missing.join(', ')}`, 409);
  if (plan.status === 'ready') return plan;
  const now = new Date().toISOString();
  return {
    ...plan,
    status: 'ready',
    step: PLAN_STEPS.length - 1,
    completedAt: now,
    updatedAt: now,
  };
}
const label = (key, value) =>
  PLAN_OPTIONS[key]?.find((item) => item.value === value)?.label || value;
export function planToBrief(plan) {
  if (plan.status !== 'ready' || !planReadiness(plan).complete)
    throw new AppError('기획을 완료한 뒤 원고를 만들 수 있어요.', 409);
  const f = plan.fields;
  const metric =
    PLAN_METRICS[f.purpose]?.find((item) => item.value === f.metric)?.label || f.metric;
  return {
    planId: plan.id,
    planRevision: plan.revision,
    source: [
      `주제: ${f.topic}`,
      `핵심 메시지: ${f.message}`,
      `접근 방식: ${f.angle}`,
      `근거·확인할 자료: ${f.evidence}`,
      `예상 질문: ${f.objection}`,
    ].join('\n\n'),
    audience: f.audience,
    instructions: [
      `콘텐츠 목적: ${label('purpose', f.purpose)}`,
      `독자의 이해 단계: ${label('awareness', f.awareness)}`,
      `독자의 필요: ${f.need}`,
      `독자의 다음 행동: ${f.action}`,
      `콘텐츠 형식: ${label('format', f.format)}`,
      `확인 기준: ${metric}${f.target ? ` · ${f.target}` : ''}`,
      `확인 시점: ${label('timeframe', f.timeframe)}`,
      `제공한 근거는 확인 전 정보일 수 있습니다. 출처·수치·후기·희소성·효과를 새로 만들어 넣지 말고 불확실한 내용은 검토 사항으로 남겨 주세요.`,
      `한 가지 핵심 메시지와 다음 행동을 중심으로 작성하세요. 목표 수치를 달성된 성과로 표현하지 마세요.`,
    ].join('\n'),
    formula: f.formula,
    customFormula: f.customFormula,
    tone: f.tone,
    length: f.length,
    channels: [...f.channels],
  };
}
export function validateStoredPlan(value) {
  requireRecord(value, '백업의 기획');
  const date = (item) => typeof item === 'string' && Number.isFinite(Date.parse(item));
  if (
    typeof value.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(value.id) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !['draft', 'ready'].includes(value.status) ||
    !date(value.createdAt) ||
    !date(value.updatedAt) ||
    (value.status === 'ready' ? !date(value.completedAt) : value.completedAt !== null)
  )
    throw new AppError('백업의 기획 정보가 올바르지 않아요.');
  const plan = {
    id: value.id,
    revision: value.revision,
    status: value.status,
    step: validStep(value.step),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    completedAt: value.completedAt,
    fields: validatePlanFields(value.fields),
  };
  if (plan.status === 'ready' && !planReadiness(plan).complete)
    throw new AppError('완료된 기획의 필수 항목이 올바르지 않아요.');
  return plan;
}
export function validatePlanBackup(backup) {
  requireRecord(backup, '백업');
  if (backup.plans === undefined) return [];
  if (!Array.isArray(backup.plans) || backup.plans.length > 10000)
    throw new AppError('백업의 기획 목록이 올바르지 않아요.');
  const ids = new Set();
  return backup.plans.map((value) => {
    const plan = validateStoredPlan(value);
    if (ids.has(plan.id)) throw new AppError('백업에 같은 기획이 중복되어 있어요.');
    ids.add(plan.id);
    return plan;
  });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function mergePlanBackup(existing, incoming) {
  const byId = new Map(existing.map((plan) => [plan.id, plan]));
  const additions = [];
  const summary = { added: 0, copies: 0, skipped: 0 };
  for (const plan of incoming) {
    const current = byId.get(plan.id);
    if (current && JSON.stringify(canonical(current)) === JSON.stringify(canonical(plan))) {
      summary.skipped++;
      continue;
    }
    if (!current) {
      additions.push(plan);
      summary.added++;
      continue;
    }
    additions.push({
      ...plan,
      id: crypto.randomUUID(),
      revision: 1,
      status: 'draft',
      completedAt: null,
      updatedAt: new Date().toISOString(),
      fields: {
        ...plan.fields,
        topic: plan.fields.topic.slice(0, 150) + ' (복원본)',
        checks: { ...EMPTY_PLAN_FIELDS.checks },
      },
    });
    summary.copies++;
  }
  return { additions, summary };
}
