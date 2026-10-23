import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  FilePlus2,
  Loader2,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from './api';
import { ChannelIcon, Modal, formatTime } from './components';
import { CHANNEL_NAMES, type Channel } from './types';
import {
  EMPTY_PLAN_FIELDS,
  PLAN_CHECKS,
  PLAN_METRICS,
  PLAN_OPTIONS,
  PLAN_STEPS,
  planReadiness,
  type Plan,
  type PlanFields,
  type PlanOption,
} from '../server/planning.mjs';
import './planning.css';

interface Props {
  onCreateContent: (plan: Plan) => void;
  onDirty: (dirty: boolean) => void;
  notify: (message: string) => void;
  initialPlanId?: string | null;
}
type Draft = { fields: PlanFields; step: number };
const snapshot = (draft: Draft) => JSON.stringify(draft);
const label = (group: string, value: string) =>
  PLAN_OPTIONS[group]?.find((option) => option.value === value)?.label || value;
const question = [
  '이 콘텐츠로 무엇을 이루고 싶나요?',
  '누구에게, 어떤 도움이 필요한가요?',
  '독자에게 남길 한 가지는 무엇인가요?',
  '읽은 뒤 무엇이 달라지면 좋을까요?',
  '어떤 구성으로 전달할까요?',
  '기획을 확인하고 다음 작업을 정하세요.',
];
const shortSteps = ['목적', '독자', '메시지', '행동', '구성', '실행'];
const objections: PlanOption[] = [
  { value: '이 정보가 왜 지금 필요한가요?', label: '왜 지금 필요한가요?' },
  { value: '나에게도 적용할 수 있나요?', label: '나에게도 적용되나요?' },
  { value: '다른 방법과 무엇이 다른가요?', label: '무엇이 다른가요?' },
  { value: '어떤 근거를 믿을 수 있나요?', label: '어떤 근거가 있나요?' },
];
const evidenceStarters = ['공식 자료 확인 예정', '내 경험·관찰 정리 예정', '관련 근거가 아직 없음'];

function freshFields(): PlanFields {
  return { ...EMPTY_PLAN_FIELDS, channels: [], checks: { ...EMPTY_PLAN_FIELDS.checks } };
}
function recommendation(fields: PlanFields) {
  if (fields.format === 'story' || fields.purpose === 'expression' || fields.purpose === 'trust')
    return { formula: 'story', reason: '경험과 관점 중심' };
  if (fields.purpose === 'action' && fields.awareness !== 'unaware')
    return { formula: 'pas', reason: '알고 있는 문제와 해결 연결' };
  if (
    fields.purpose === 'action' ||
    (fields.purpose === 'awareness' && fields.awareness === 'unaware')
  )
    return { formula: 'aida', reason: '관심에서 다음 행동으로 연결' };
  return { formula: 'information', reason: '핵심과 활용 방법 중심' };
}

export default function Planner({ onCreateContent, onDirty, notify, initialPlanId = null }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [fields, setFields] = useState<PlanFields>(freshFields);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveConflict, setSaveConflict] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [purposeChanged, setPurposeChanged] = useState(false);
  const [filter, setFilter] = useState<'all' | 'draft' | 'ready'>('all');
  const planRef = useRef<Plan | null>(null);
  const draftRef = useRef<Draft>({ fields: freshFields(), step: 0 });
  const savedRef = useRef('');
  const savePromise = useRef<Promise<Plan | null> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const feedback = useRef<HTMLDivElement>(null);
  const dirty = Boolean(plan) && snapshot({ fields, step }) !== savedRef.current;
  const saving = saveState === 'saving';
  const livePlan = plan ? { ...plan, fields, step } : null;
  const readiness = livePlan ? planReadiness(livePlan) : null;
  const ready = plan?.status === 'ready' && !dirty;
  const recommended = recommendation(fields);

  const updateList = useCallback((value: Plan) => {
    setPlans((current) =>
      [value, ...current.filter((item) => item.id !== value.id)].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    );
  }, []);
  const activate = useCallback((value: Plan) => {
    clearTimeout(timer.current);
    planRef.current = value;
    draftRef.current = { fields: value.fields, step: value.step };
    savedRef.current = snapshot(draftRef.current);
    setPlan(value);
    setFields(value.fields);
    setStep(value.step);
    setSaveState('saved');
    setSaveConflict(false);
    setValidation([]);
    setError('');
    setPurposeChanged(false);
    window.scrollTo({ top: 0 });
  }, []);
  const flush = useCallback(async (): Promise<Plan | null> => {
    clearTimeout(timer.current);
    if (savePromise.current) {
      await savePromise.current;
      if (planRef.current && snapshot(draftRef.current) !== savedRef.current) return flush();
      return planRef.current;
    }
    if (!planRef.current || snapshot(draftRef.current) === savedRef.current) return planRef.current;
    const task = (async () => {
      try {
        if (mounted.current) {
          setSaveState('saving');
          setSaveConflict(false);
          setError('');
        }
        while (planRef.current && snapshot(draftRef.current) !== savedRef.current) {
          const current = planRef.current;
          const sent: Draft = {
            fields: structuredClone(draftRef.current.fields),
            step: draftRef.current.step,
          };
          const result = await api<Plan>(`/plans/${current.id}`, {
            method: 'PUT',
            body: JSON.stringify({ revision: current.revision, ...sent }),
          });
          // Preserve typing that happened while the request was in flight. Server-side
          // preflight resets remain authoritative unless the user has checked again.
          let acknowledged = sent;
          if (JSON.stringify(sent.fields.checks) !== JSON.stringify(result.fields.checks)) {
            acknowledged = { ...sent, fields: { ...sent.fields, checks: result.fields.checks } };
            if (
              JSON.stringify(draftRef.current.fields.checks) === JSON.stringify(sent.fields.checks)
            ) {
              draftRef.current = {
                ...draftRef.current,
                fields: { ...draftRef.current.fields, checks: result.fields.checks },
              };
              if (mounted.current) setFields(draftRef.current.fields);
            }
          }
          planRef.current = result;
          savedRef.current = snapshot(acknowledged);
          if (mounted.current) {
            setPlan(result);
            updateList(result);
          }
        }
        if (mounted.current) setSaveState('saved');
        return planRef.current;
      } catch (err) {
        if (mounted.current) {
          setSaveState('error');
          setSaveConflict((err as Error & { status?: number }).status === 409);
          setError((err as Error).message);
        }
        throw err;
      }
    })();
    savePromise.current = task;
    try {
      return await task;
    } finally {
      savePromise.current = null;
    }
  }, [updateList]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void api<Plan[]>('/plans')
      .then(async (values) => {
        if (!active) return;
        setPlans(values);
        if (initialPlanId) {
          const value =
            values.find((item) => item.id === initialPlanId) ||
            (await api<Plan>(`/plans/${initialPlanId}`));
          if (active) activate(value);
        }
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activate, initialPlanId]);
  useEffect(() => {
    if (validation.length) feedback.current?.focus();
  }, [validation]);
  useEffect(() => {
    onDirty(dirty || saving);
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty || saving) event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty, saving, onDirty]);
  useEffect(() => {
    if (!plan || !dirty) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 650);
    return () => clearTimeout(timer.current);
  }, [fields, step, plan?.id, flush, dirty]);

  const change = <K extends keyof PlanFields>(key: K, value: PlanFields[K]) => {
    const current = draftRef.current.fields;
    let next = { ...current, [key]: value };
    if (key !== 'checks' && JSON.stringify(current[key]) !== JSON.stringify(value))
      next = { ...next, checks: { ...EMPTY_PLAN_FIELDS.checks } };
    if (key === 'purpose' && value !== current.purpose) {
      next = {
        ...next,
        metric: '',
        target: '',
        ...(PLAN_OPTIONS.action.some((option) => option.value === current.action)
          ? { action: '' }
          : {}),
      };
      setPurposeChanged(Boolean(current.purpose));
    }
    draftRef.current = { ...draftRef.current, fields: next };
    setFields(next);
    setValidation([]);
  };
  const move = async (nextStep: number, validate = false) => {
    if (!plan || busy) return;
    if (validate) {
      const missing = planReadiness({ ...plan, ...draftRef.current }).steps[step].missing;
      if (missing.length) {
        setValidation(missing);
        feedback.current?.focus();
        return;
      }
    }
    setBusy(true);
    try {
      await flush();
      draftRef.current = { ...draftRef.current, step: nextStep };
      setStep(nextStep);
      setValidation([]);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch {
      /* Save error remains visible. */
    } finally {
      setBusy(false);
    }
  };
  const open = async (value: Plan) => {
    if (busy) return;
    setBusy(true);
    try {
      await flush();
      activate(await api<Plan>(`/plans/${value.id}`));
    } catch {
      /* Retain the unsaved plan. */
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await flush();
      const value = await api<Plan>('/plans', { method: 'POST', body: '{}' });
      updateList(value);
      activate(value);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const back = async () => {
    setBusy(true);
    try {
      await flush();
      clearTimeout(timer.current);
      setPlan(null);
      planRef.current = null;
      setValidation([]);
      setError('');
      onDirty(false);
    } catch {
      /* Keep the current input when storage is unavailable. */
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    if (!plan) return;
    const missing = planReadiness({ ...plan, ...draftRef.current }).missing;
    if (missing.length) {
      setValidation(missing);
      feedback.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const saved = await flush();
      if (!saved) return;
      const value = await api<Plan>(`/plans/${saved.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ revision: saved.revision }),
      });
      activate(value);
      updateList(value);
      notify('기획을 확정했습니다.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const preserveCopy = async () => {
    setBusy(true);
    try {
      const current = draftRef.current;
      const value = await api<Plan>('/plans', {
        method: 'POST',
        body: JSON.stringify({
          ...current,
          fields: {
            ...current.fields,
            topic: `${current.fields.topic.slice(0, 150) || '새 기획'} (보관본)`,
            checks: { ...EMPTY_PLAN_FIELDS.checks },
          },
        }),
      });
      updateList(value);
      activate(value);
      notify('현재 입력을 별도 기획으로 보관했습니다.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/plans/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ revision: deleteTarget.revision }),
      });
      setPlans((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      notify('기획을 삭제했습니다.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="empty-state">
        <Loader2 className="spin" size={28} />
        <h2>기획을 불러오는 중</h2>
      </div>
    );
  return (
    <div className="planner">
      {plan ? (
        <>
          <div className="planner-toolbar">
            <button className="back-button" disabled={busy} onClick={() => void back()}>
              <ArrowLeft size={16} />
              기획 목록
            </button>
            <div className="planner-save" role="status">
              {saving || dirty ? (
                <>
                  <Loader2 size={14} className={saving ? 'spin' : ''} />
                  {saveState === 'error' ? '저장하지 못했습니다.' : '저장 중…'}
                </>
              ) : (
                <>
                  <Check size={14} />
                  저장됨
                </>
              )}
            </div>
          </div>
          <div className="planner-heading">
            <div>
              <span className={`planner-state ${ready ? 'ready' : ''}`}>
                {ready ? '기획 확정' : '기획 중'}
              </span>
              <h2>{fields.topic || '새 기획'}</h2>
            </div>
            <span className="planner-completion">
              {readiness?.completedSteps} / {PLAN_STEPS.length} 단계
            </span>
          </div>
          <div
            className="planner-progress"
            role="progressbar"
            aria-label="기획 진행률"
            aria-valuemin={0}
            aria-valuemax={PLAN_STEPS.length}
            aria-valuenow={readiness?.completedSteps || 0}
            aria-valuetext={`${readiness?.completedSteps || 0}개 단계 완료, 전체 ${PLAN_STEPS.length}개`}
          >
            <span style={{ width: `${readiness?.progress || 0}%` }} />
          </div>
          <nav className="planner-steps" aria-label="기획 단계">
            {PLAN_STEPS.map((item, index) => (
              <button
                key={item.id}
                className={`${step === index ? 'active' : ''} ${readiness?.steps[index].complete ? 'complete' : ''}`}
                aria-current={step === index ? 'step' : undefined}
                disabled={busy}
                onClick={() => void move(index)}
              >
                <span>{readiness?.steps[index].complete ? <Check size={13} /> : index + 1}</span>
                {shortSteps[index]}
              </button>
            ))}
          </nav>
          {error && (
            <div className="error-message planner-save-error" role="alert">
              <span>{error}</span>
              {saveState === 'error' && (
                <div>
                  <button disabled={busy} onClick={() => void flush().catch(() => {})}>
                    다시 저장
                  </button>
                  {saveConflict && (
                    <button disabled={busy} onClick={() => void preserveCopy()}>
                      현재 입력을 새 기획으로 저장
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {!!validation.length && (
            <div className="planner-validation" role="alert" tabIndex={-1} ref={feedback}>
              <b>다음 항목을 확인해 주세요.</b>
              <ul>
                {validation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="planner-workspace">
            <section className="planner-stage" aria-labelledby="planner-stage-title">
              <div className="planner-stage-heading">
                <span>{String(step + 1).padStart(2, '0')}</span>
                <div>
                  <p>{PLAN_STEPS[step].label}</p>
                  <h3 id="planner-stage-title">{question[step]}</h3>
                </div>
              </div>
              <fieldset className="planner-fields" disabled={busy}>
                {step === 0 && (
                  <>
                    <TextField
                      label="기획할 콘텐츠"
                      value={fields.topic}
                      maxLength={160}
                      placeholder="예: 처음 시작하는 사람을 위한 독서 모임"
                      onChange={(value) => change('topic', value)}
                    />
                    <ChoiceField
                      label="콘텐츠의 목적"
                      value={fields.purpose}
                      options={PLAN_OPTIONS.purpose}
                      onChange={(value) => change('purpose', value)}
                    />
                    {purposeChanged && (
                      <p className="planner-purpose-change" role="status">
                        목적이 바뀌었습니다. 성과 기준과 다음 행동을 다시 확인해 주세요.
                      </p>
                    )}
                    {fields.purpose && (
                      <ChoiceField
                        label="성과 확인 방법"
                        value={fields.metric}
                        options={PLAN_METRICS[fields.purpose] || []}
                        onChange={(value) => change('metric', value)}
                      />
                    )}
                    {fields.metric && (
                      <TextField
                        label={
                          fields.metric === 'custom' ? '직접 정한 확인 기준' : '목표 기준 (선택)'
                        }
                        value={fields.target}
                        maxLength={300}
                        placeholder={
                          fields.metric === 'custom'
                            ? '어떤 상태가 되면 목적을 이뤘다고 볼까요?'
                            : '예: 독자가 내용을 설명하거나 직접 적용한다'
                        }
                        onChange={(value) => change('target', value)}
                      />
                    )}
                    <ChoiceField
                      label="확인 시점"
                      value={fields.timeframe}
                      options={PLAN_OPTIONS.timeframe}
                      allowCustom
                      onChange={(value) => change('timeframe', value)}
                    />
                  </>
                )}
                {step === 1 && (
                  <>
                    <ChoiceField
                      label="핵심 독자"
                      value={fields.audience}
                      options={PLAN_OPTIONS.audience}
                      allowCustom
                      onChange={(value) => change('audience', value)}
                    />
                    <ChoiceField
                      label="독자의 현재 상태"
                      value={fields.awareness}
                      options={PLAN_OPTIONS.awareness}
                      onChange={(value) => change('awareness', value)}
                    />
                    <ChoiceField
                      label="독자가 필요한 것"
                      value={fields.need}
                      options={PLAN_OPTIONS.need}
                      allowCustom
                      onChange={(value) => change('need', value)}
                    />
                  </>
                )}
                {step === 2 && (
                  <>
                    <TextField
                      label="핵심 메시지 한 문장"
                      value={fields.message}
                      maxLength={1000}
                      multiline
                      placeholder="독자가 기억할 한 가지"
                      onChange={(value) => change('message', value)}
                    />
                    <ChoiceField
                      label="전달 방식"
                      value={fields.angle}
                      options={PLAN_OPTIONS.angle}
                      allowCustom
                      onChange={(value) => change('angle', value)}
                    />
                    <TextField
                      label="근거·확인할 자료"
                      value={fields.evidence}
                      maxLength={6000}
                      multiline
                      placeholder="경험, 확인한 사실, 자료 링크 또는 아직 확인할 내용"
                      onChange={(value) => change('evidence', value)}
                    />
                    {!fields.evidence.trim() && (
                      <div className="planner-starters" aria-label="근거 준비 상태">
                        {evidenceStarters.map((value) => (
                          <button
                            type="button"
                            key={value}
                            onClick={() => change('evidence', value)}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    )}
                    <ChoiceField
                      label="독자의 예상 질문"
                      value={fields.objection}
                      options={objections}
                      allowCustom
                      onChange={(value) => change('objection', value)}
                    />
                  </>
                )}
                {step === 3 && (
                  <>
                    <ChoiceField
                      label="독자가 할 다음 행동"
                      value={fields.action}
                      options={PLAN_OPTIONS.action}
                      allowCustom
                      onChange={(value) => change('action', value)}
                    />
                    <fieldset className="planner-choice-group">
                      <legend>발행할 채널</legend>
                      <div className="planner-channel-options">
                        {(Object.keys(CHANNEL_NAMES) as Channel[]).map((channel) => (
                          <label
                            key={channel}
                            className={fields.channels.includes(channel) ? 'selected' : ''}
                          >
                            <input
                              type="checkbox"
                              aria-label={CHANNEL_NAMES[channel]}
                              checked={fields.channels.includes(channel)}
                              onChange={() =>
                                change(
                                  'channels',
                                  fields.channels.includes(channel)
                                    ? fields.channels.filter((value) => value !== channel)
                                    : [...fields.channels, channel],
                                )
                              }
                            />
                            <ChannelIcon channel={channel} />
                            <span>{CHANNEL_NAMES[channel]}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </>
                )}
                {step === 4 && (
                  <>
                    <ChoiceField
                      label="콘텐츠 형식"
                      value={fields.format}
                      options={PLAN_OPTIONS.format}
                      onChange={(value) => change('format', value)}
                    />
                    <div className="planner-recommendation">
                      <div>
                        <Sparkles size={16} />
                        <span>
                          구성 제안: <b>{label('formula', recommended.formula)}</b>
                          <small>{recommended.reason}</small>
                        </span>
                      </div>
                      <button
                        className="button"
                        type="button"
                        onClick={() => change('formula', recommended.formula)}
                      >
                        추천 적용
                      </button>
                    </div>
                    <ChoiceField
                      label="구성 공식"
                      value={fields.formula}
                      options={PLAN_OPTIONS.formula}
                      onChange={(value) => change('formula', value)}
                    />
                    {fields.formula === 'custom' && (
                      <TextField
                        label="나만의 공식"
                        value={fields.customFormula}
                        multiline
                        maxLength={3000}
                        placeholder="예: 질문 → 내 경험 → 배운 점 → 독자에게 질문"
                        onChange={(value) => change('customFormula', value)}
                      />
                    )}
                    <ChoiceField
                      label="말투"
                      value={fields.tone}
                      options={PLAN_OPTIONS.tone}
                      onChange={(value) => change('tone', value)}
                    />
                    <ChoiceField
                      label="분량"
                      value={fields.length}
                      options={PLAN_OPTIONS.length}
                      onChange={(value) => change('length', value)}
                    />
                  </>
                )}
                {step === 5 && (
                  <>
                    <ChoiceField
                      label="시작할 때"
                      value={fields.trigger}
                      options={PLAN_OPTIONS.trigger}
                      allowCustom
                      onChange={(value) => change('trigger', value)}
                    />
                    <ChoiceField
                      label="가장 작은 다음 작업"
                      value={fields.nextStep}
                      options={PLAN_OPTIONS.nextStep}
                      allowCustom
                      onChange={(value) => change('nextStep', value)}
                    />
                    {fields.trigger && fields.nextStep && (
                      <p className="planner-intention">
                        <span>{label('trigger', fields.trigger)}</span>
                        <ArrowRight size={16} />
                        <b>{label('nextStep', fields.nextStep)}</b>
                      </p>
                    )}
                    <BriefSummary fields={fields} onEdit={(index) => void move(index)} />
                    <fieldset className="planner-confirmations">
                      <legend>확정 전 확인</legend>
                      {PLAN_CHECKS.map(({ id, label: title }) => (
                        <label key={id}>
                          <input
                            type="checkbox"
                            checked={fields.checks[id]}
                            onChange={(event) =>
                              change('checks', { ...fields.checks, [id]: event.target.checked })
                            }
                          />
                          <span>{title}</span>
                        </label>
                      ))}
                    </fieldset>
                  </>
                )}
              </fieldset>
              <div className="planner-footer">
                <button
                  className="button"
                  disabled={busy || step === 0}
                  onClick={() => void move(step - 1)}
                >
                  <ArrowLeft size={15} />
                  이전
                </button>
                <span>
                  {step + 1} / {PLAN_STEPS.length}
                </span>
                {step < PLAN_STEPS.length - 1 ? (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void move(step + 1, true)}
                  >
                    다음
                    <ArrowRight size={16} />
                  </button>
                ) : ready ? (
                  <button
                    className="button primary"
                    disabled={busy || dirty || saving}
                    onClick={() => {
                      if (planRef.current) onCreateContent(planRef.current);
                    }}
                  >
                    <Sparkles size={16} />이 기획으로 AI 원고 만들기
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void complete()}
                  >
                    {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}기획 확정
                  </button>
                )}
              </div>
            </section>
            <aside className="planner-context" aria-label="현재 기획 요약">
              <h3>기획의 중심</h3>
              <dl>
                <dt>목적</dt>
                <dd>{label('purpose', fields.purpose) || '선택 전'}</dd>
                <dt>독자</dt>
                <dd>{fields.audience || '선택 전'}</dd>
                <dt>한 가지 메시지</dt>
                <dd>{fields.message || '입력 전'}</dd>
                <dt>다음 행동</dt>
                <dd>{fields.action || '선택 전'}</dd>
              </dl>
              <div className="planner-context-metric">
                <span>확인 기준</span>
                <b>
                  {PLAN_METRICS[fields.purpose]?.find((item) => item.value === fields.metric)
                    ?.label ||
                    fields.metric ||
                    '선택 전'}
                </b>
                {fields.target && <p>{fields.target}</p>}
              </div>
            </aside>
          </div>
        </>
      ) : (
        <>
          <div className="planner-list-toolbar">
            <div className="planner-list-filter" role="group" aria-label="기획 상태 필터">
              {(
                [
                  { id: 'all', title: '전체' },
                  { id: 'draft', title: '기획 중' },
                  { id: 'ready', title: '확정' },
                ] as const
              ).map(({ id, title }) => (
                <button
                  key={id}
                  className={filter === id ? 'active' : ''}
                  onClick={() => setFilter(id)}
                >
                  {title}
                  <span>{plans.filter((value) => id === 'all' || value.status === id).length}</span>
                </button>
              ))}
            </div>
            <button className="button primary" disabled={busy} onClick={() => void create()}>
              <Plus size={17} />새 기획 만들기
            </button>
          </div>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          {!plans.length ? (
            <div className="empty-state planner-empty">
              <FilePlus2 size={36} />
              <h2>아직 기획이 없습니다.</h2>
              <button className="button primary" disabled={busy} onClick={() => void create()}>
                <Plus size={17} />첫 기획 시작하기
              </button>
            </div>
          ) : !plans.some((value) => filter === 'all' || value.status === filter) ? (
            <div className="empty-state">
              <h2>해당하는 기획이 없습니다.</h2>
            </div>
          ) : (
            <div className="planner-list">
              {plans
                .filter((value) => filter === 'all' || value.status === filter)
                .map((value) => {
                  const result = planReadiness(value);
                  return (
                    <article className="planner-card" key={value.id}>
                      <div className="planner-card-top">
                        <span
                          className={`planner-state ${value.status === 'ready' ? 'ready' : ''}`}
                        >
                          {value.status === 'ready' ? '기획 확정' : '기획 중'}
                        </span>
                        <button
                          className="icon-button"
                          aria-label={`기획 삭제: ${value.fields.topic || '새 기획'}`}
                          onClick={() => setDeleteTarget(value)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <button className="planner-card-title" onClick={() => void open(value)}>
                        <h2>{value.fields.topic || '제목 없는 기획'}</h2>
                      </button>
                      <div className="planner-card-purpose">
                        {label('purpose', value.fields.purpose) || '목적 선택 전'}
                        {value.fields.audience && (
                          <>
                            <span>·</span>
                            {value.fields.audience}
                          </>
                        )}
                      </div>
                      <div className="planner-card-progress">
                        <span style={{ width: `${result.progress}%` }} />
                      </div>
                      <div className="planner-card-meta">
                        <span>
                          {result.completedSteps} / {PLAN_STEPS.length} 단계
                        </span>
                        <time>{formatTime(value.updatedAt)}</time>
                      </div>
                      <button
                        className="planner-card-open"
                        disabled={busy}
                        onClick={() => void open(value)}
                      >
                        {value.status === 'ready' ? '기획 열기' : '기획 이어하기'}
                        <ChevronRight size={16} />
                      </button>
                    </article>
                  );
                })}
            </div>
          )}
        </>
      )}
      {deleteTarget && (
        <Modal title="기획을 삭제할까요?" onClose={() => setDeleteTarget(null)}>
          <p className="modal-description">
            ‘{deleteTarget.fields.topic || '새 기획'}’ 기획을 삭제합니다. 작성한 원고는 유지됩니다.
          </p>
          <div className="modal-actions">
            <button className="button" disabled={busy} onClick={() => setDeleteTarget(null)}>
              취소
            </button>
            <button className="button danger" disabled={busy} onClick={() => void remove()}>
              기획 삭제
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ChoiceField({
  label: title,
  value,
  options,
  onChange,
  allowCustom = false,
}: {
  label: string;
  value: string;
  options: PlanOption[];
  onChange: (value: string) => void;
  allowCustom?: boolean;
}) {
  const [custom, setCustom] = useState(
    Boolean(value) && !options.some((option) => option.value === value),
  );
  const groupId = `plan-${title.replace(/\s/g, '-')}`;
  useEffect(() => {
    if (value && options.some((option) => option.value === value)) setCustom(false);
    else if (value && allowCustom) setCustom(true);
  }, [value, options, allowCustom]);
  return (
    <fieldset className="planner-choice-group">
      <legend>{title}</legend>
      <div className="planner-options">
        {options.map((option) => (
          <label key={option.value} className={!custom && value === option.value ? 'selected' : ''}>
            <input
              type="radio"
              name={groupId}
              value={option.value}
              checked={!custom && value === option.value}
              onChange={() => {
                setCustom(false);
                onChange(option.value);
              }}
            />
            <span>{option.label}</span>
            {!custom && value === option.value && <Check size={15} aria-hidden="true" />}
          </label>
        ))}
        {allowCustom && (
          <label className={custom ? 'selected' : ''}>
            <input
              type="radio"
              name={groupId}
              checked={custom}
              onChange={() => {
                setCustom(true);
                onChange('');
              }}
            />
            <span>직접 입력</span>
            {custom && <PencilLine size={14} />}
          </label>
        )}
      </div>
      {allowCustom && custom && (
        <input
          className="planner-custom-input"
          aria-label={`${title} 직접 입력`}
          value={value}
          maxLength={
            ['독자가 필요한 것', '독자의 예상 질문'].includes(title)
              ? 1000
              : ['독자가 할 다음 행동', '시작할 때', '가장 작은 다음 작업'].includes(title)
                ? 500
                : 300
          }
          placeholder="직접 정한 내용을 입력하세요."
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </fieldset>
  );
}
function TextField({
  label: title,
  value,
  maxLength,
  placeholder,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  maxLength: number;
  placeholder?: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const id = `plan-${title.replace(/\s/g, '-')}`;
  return (
    <div className="field planner-text-field">
      <label htmlFor={id}>{title}</label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
function BriefSummary({ fields, onEdit }: { fields: PlanFields; onEdit: (step: number) => void }) {
  const metric =
    PLAN_METRICS[fields.purpose]?.find((item) => item.value === fields.metric)?.label ||
    fields.metric;
  return (
    <section className="planner-brief" aria-label="기획 최종 요약">
      <div className="planner-brief-heading">
        <h4>한눈에 보는 기획</h4>
      </div>
      <dl>
        <div>
          <dt>목적·확인 기준</dt>
          <dd>
            {label('purpose', fields.purpose)}
            <span>
              {metric}
              {fields.target ? ` · ${fields.target}` : ''} · {label('timeframe', fields.timeframe)}
            </span>
          </dd>
          <button type="button" aria-label="목적 수정" onClick={() => onEdit(0)}>
            <PencilLine size={14} />
          </button>
        </div>
        <div>
          <dt>독자·필요</dt>
          <dd>
            {fields.audience}
            <span>{fields.need}</span>
          </dd>
          <button type="button" aria-label="독자 수정" onClick={() => onEdit(1)}>
            <PencilLine size={14} />
          </button>
        </div>
        <div>
          <dt>핵심 메시지</dt>
          <dd>{fields.message}</dd>
          <button type="button" aria-label="메시지 수정" onClick={() => onEdit(2)}>
            <PencilLine size={14} />
          </button>
        </div>
        <div>
          <dt>다음 행동</dt>
          <dd>
            {fields.action}
            <span>{fields.channels.map((channel) => CHANNEL_NAMES[channel]).join(' · ')}</span>
          </dd>
          <button type="button" aria-label="행동 수정" onClick={() => onEdit(3)}>
            <PencilLine size={14} />
          </button>
        </div>
      </dl>
      <details>
        <summary>근거와 구성 보기</summary>
        <dl>
          <div>
            <dt>근거·확인할 자료</dt>
            <dd>{fields.evidence}</dd>
          </div>
          <div>
            <dt>예상 질문</dt>
            <dd>{fields.objection}</dd>
          </div>
          <div>
            <dt>구성</dt>
            <dd>
              {label('format', fields.format)} · {label('formula', fields.formula)} ·{' '}
              {label('tone', fields.tone)} · {label('length', fields.length)}
              {fields.customFormula && <span>{fields.customFormula}</span>}
            </dd>
            <button type="button" aria-label="구성 수정" onClick={() => onEdit(4)}>
              <PencilLine size={14} />
            </button>
          </div>
        </dl>
      </details>
    </section>
  );
}
