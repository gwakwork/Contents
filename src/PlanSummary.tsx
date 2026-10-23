import { PLAN_METRICS, PLAN_OPTIONS, type Plan } from '../server/planning.mjs';

const label = (key: string, value: string) =>
  PLAN_OPTIONS[key]?.find((option) => option.value === value)?.label || value;
export default function PlanSummary({ plan, compact = false }: { plan: Plan; compact?: boolean }) {
  const f = plan.fields;
  const metric =
    PLAN_METRICS[f.purpose]?.find((option) => option.value === f.metric)?.label || f.metric;
  const rows = [
    ['목적', label('purpose', f.purpose)],
    ['독자', f.audience],
    ['핵심 메시지', f.message],
    ['원하는 행동', f.action],
    ...(!compact
      ? [
          ['확인 기준', [metric, f.target].filter(Boolean).join(' · ')],
          ['확인 시점', label('timeframe', f.timeframe)],
          ['근거·확인할 자료', f.evidence],
          ['예상 질문', f.objection],
          ['실행 계획', `${f.trigger}, ${f.nextStep}`],
        ]
      : []),
  ];
  return (
    <dl className="plan-brief-summary">
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value || '미정'}</dd>
        </div>
      ))}
    </dl>
  );
}
