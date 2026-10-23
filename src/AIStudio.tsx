import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  KeyRound,
  Loader2,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  WandSparkles,
} from 'lucide-react';
import { api } from './api';
import { ChannelIcon, Modal, formatTime } from './components';
import { CHANNEL_NAMES, type Channel, type Content } from './types';
import { LOCAL_MODE } from './local-api';
import { planToBrief, type Plan } from '../server/planning.mjs';
import PlanSummary from './PlanSummary';

interface Formula {
  id: string;
  name: string;
  summary: string;
  stages: string[];
}
interface AIInput {
  planId?: string;
  planRevision?: number;
  planning?: Plan;
  source: string;
  formula: string;
  customFormula: string;
  audience: string;
  instructions: string;
  tone: string;
  length: string;
  channels: Channel[];
}
interface AIResult {
  title: string;
  excerpt: string;
  body: string;
  instagram: string;
  threads: string;
  changes: string[];
  reviewNotes: string[];
  formulaSteps: { stage: string; summary: string }[];
}
interface Run {
  id: string;
  input: AIInput;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  result: AIResult | null;
  error: string | null;
  model: string;
  createdAt: string;
  contentId: string | null;
  usage?: { inputTokens: number | null; outputTokens: number | null };
}
interface Settings {
  configured: boolean;
  model: string;
  source: string;
}
const EMPTY: AIInput = {
  source: '',
  formula: 'aida',
  customFormula: '',
  audience: '',
  instructions: '',
  tone: 'friendly',
  length: 'medium',
  channels: ['website'],
};
const STATUS = {
  running: '각색 중',
  completed: '완료',
  failed: '실패',
  cancelled: '취소',
  interrupted: '중단',
};

export default function AIStudio({
  onAdopt,
  onDirty,
  notify,
  initialPlan,
  onPlanEdit,
}: {
  onAdopt: (content: Content) => void;
  onDirty: (dirty: boolean) => void;
  notify: (message: string) => void;
  initialPlan?: Plan;
  onPlanEdit?: (plan: Plan) => void;
}) {
  const initialInput: AIInput = initialPlan
    ? planToBrief(initialPlan)
    : { ...EMPTY, channels: ['website'] };
  const [input, setInput] = useState<AIInput>(initialInput);
  const [savedInput, setSavedInput] = useState(JSON.stringify(initialInput));
  const [linkedPlan, setLinkedPlan] = useState<Plan | null>(initialPlan ?? null);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<Channel>('website');
  const request = useRef<{ id: string; input: string } | null>(null);
  const running = run?.status === 'running';
  const dirty = JSON.stringify(input) !== savedInput;
  useEffect(() => {
    onDirty(dirty);
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty, onDirty]);
  const choose = (value: Run) => {
    setRun(value);
    setLinkedPlan(value.input.planning ?? null);
    setInput(value.input);
    setSavedInput(JSON.stringify(value.input));
    setChannel(value.input.channels[0]);
    request.current = null;
    setError('');
  };
  useEffect(() => {
    if (LOCAL_MODE) return;
    let alive = true;
    void Promise.all([
      api<Formula[]>('/ai/formulas'),
      api<Settings>('/ai/settings'),
      api<Run[]>('/ai/generations'),
    ])
      .then(([f, s, r]) => {
        if (!alive) return;
        setFormulas(f);
        setSettings(s);
        setRuns(r);
        if (!initialPlan && r[0]) choose(r[0]);
      })
      .catch((err) => {
        if (alive) setError((err as Error).message);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!run || run.status !== 'running') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<Run>(`/ai/generations/${run.id}`);
        if (!alive) return;
        setRun(next);
        setError('');
        if (next.status !== 'running') {
          request.current = null;
          setRuns(await api<Run[]>('/ai/generations'));
          return;
        }
      } catch {
        if (alive)
          setError(
            '작업 상태에 연결하지 못했어요. AI 요청을 다시 보내지 않고 상태만 확인하고 있어요.',
          );
      }
      if (alive) timer = setTimeout(() => void poll(), 1200);
    };
    timer = setTimeout(() => void poll(), 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [run?.id, run?.status]);
  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const snapshot = JSON.stringify(input);
      if (!request.current || request.current.input !== snapshot)
        request.current = { id: crypto.randomUUID(), input: snapshot };
      const next = await api<Run>('/ai/generations', {
        method: 'POST',
        body: JSON.stringify({ ...input, requestId: request.current.id }),
      });
      setRun(next);
      setLinkedPlan(next.input.planning ?? null);
      setSavedInput(snapshot);
      setChannel(input.channels[0]);
      setRuns(await api<Run[]>('/ai/generations'));
      if (next.status !== 'running') request.current = null;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!run) return;
    setBusy(true);
    try {
      setRun(await api<Run>(`/ai/generations/${run.id}/cancel`, { method: 'POST', body: '{}' }));
      request.current = null;
      setRuns(await api<Run[]>('/ai/generations'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const adopt = async () => {
    if (!run || dirty) return;
    setBusy(true);
    try {
      const content = await api<Content>(`/ai/generations/${run.id}/adopt`, {
        method: 'POST',
        body: '{}',
      });
      onAdopt(content);
      notify('검토함으로 보냈습니다.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const change = <K extends keyof AIInput>(key: K, value: AIInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }));
  if (LOCAL_MODE)
    return (
      <div className="ai-offline">
        <Sparkles size={30} />
        <h2>Mac 실행 버전이 필요합니다.</h2>
        <a
          className="button primary"
          href="https://github.com/gwakwork/Contents/blob/main/release/narrative-mac.zip"
          target="_blank"
          rel="noreferrer"
        >
          Narrative 다운로드
        </a>
      </div>
    );
  const formula = formulas.find((f) => f.id === input.formula);
  const result = run?.status === 'completed' ? run.result : null;
  const actualChannel = run?.input.channels.includes(channel)
    ? channel
    : (run?.input.channels[0] ?? 'website');
  return (
    <div className="ai-studio">
      <div className="ai-toolbar">
        <div className={`ai-connection ${settings?.configured ? 'configured' : ''}`}>
          <KeyRound size={15} />
          <span>
            {settings?.configured ? `API 키 저장됨 · ${settings.model}` : 'API 키 미연결'}
          </span>
        </div>
        <button className="button" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={15} />
          AI 연결 설정
        </button>
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {linkedPlan && (
        <section className="ai-plan-link" aria-label="연결된 기획">
          <div>
            <span>연결된 기획 · v{linkedPlan.revision}</span>
            <h2>{linkedPlan.fields.topic}</h2>
          </div>
          {onPlanEdit && (
            <button className="button" onClick={() => onPlanEdit(linkedPlan)}>
              기획 수정
            </button>
          )}
          <details>
            <summary>기획 기준</summary>
            <PlanSummary plan={linkedPlan} compact />
          </details>
        </section>
      )}
      <div className="ai-workspace">
        <section className="ai-input-panel">
          <div className="ai-section-heading">
            <span>01</span>
            <div>
              <h3>원문</h3>
            </div>
          </div>
          <fieldset disabled={busy || running} className="ai-fieldset">
            <div className="field">
              <label htmlFor="ai-source">
                각색할 원문<span>필수</span>
              </label>
              <textarea
                id="ai-source"
                maxLength={20000}
                placeholder="각색할 내용을 붙여 넣으세요."
                value={input.source}
                onChange={(event) => change('source', event.target.value)}
              />
              <span className="ai-character-count">
                {input.source.length.toLocaleString()} / 20,000자
              </span>
            </div>
            <div className="field">
              <label>콘텐츠 공식</label>
              <div className="formula-choices">
                {formulas.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    className={input.formula === f.id ? 'selected' : ''}
                    aria-pressed={input.formula === f.id}
                    onClick={() => change('formula', f.id)}
                  >
                    {f.name}
                    {input.formula === f.id && <Check size={13} />}
                  </button>
                ))}
              </div>

              {formula?.stages.length ? (
                <div className="formula-steps">
                  {formula.stages.map((s, index) => (
                    <span key={s}>
                      {index > 0 && <ChevronRight size={10} />}
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {input.formula === 'custom' && (
              <div className="field">
                <label htmlFor="ai-custom">나만의 공식</label>
                <textarea
                  id="ai-custom"
                  maxLength={3000}
                  value={input.customFormula}
                  onChange={(event) => change('customFormula', event.target.value)}
                  placeholder="예: 공감 질문 → 실제 경험 → 배운 점 → 독자에게 질문"
                />
              </div>
            )}
            <div className="ai-option-row">
              <div className="field">
                <label htmlFor="ai-tone">말투</label>
                <select
                  id="ai-tone"
                  value={input.tone}
                  onChange={(event) => change('tone', event.target.value)}
                >
                  <option value="friendly">친근하게</option>
                  <option value="professional">전문적으로</option>
                  <option value="concise">간결하게</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="ai-length">본문 분량</label>
                <select
                  id="ai-length"
                  value={input.length}
                  onChange={(event) => change('length', event.target.value)}
                >
                  <option value="short">짧게 · 300~600자</option>
                  <option value="medium">보통 · 800~1,500자</option>
                  <option value="long">길게 · 1,800~3,000자</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="ai-audience">
                누구에게 전하나요?<small>선택</small>
              </label>
              <input
                id="ai-audience"
                maxLength={300}
                value={input.audience}
                onChange={(event) => change('audience', event.target.value)}
                placeholder="예: 혼자 사업을 시작한 1인 창업자"
              />
            </div>
            <div className="field">
              <label>준비할 채널</label>
              <div className="channel-choices">
                {(Object.keys(CHANNEL_NAMES) as Channel[]).map((c) => (
                  <label key={c} className={input.channels.includes(c) ? 'selected' : ''}>
                    <input
                      type="checkbox"
                      aria-label={CHANNEL_NAMES[c]}
                      checked={input.channels.includes(c)}
                      onChange={() => {
                        if (input.channels.length === 1 && input.channels.includes(c)) return;
                        change(
                          'channels',
                          input.channels.includes(c)
                            ? input.channels.filter((v) => v !== c)
                            : [...input.channels, c],
                        );
                      }}
                    />
                    <ChannelIcon channel={c} />
                    <span>{CHANNEL_NAMES[c]}</span>
                    <span className="check-square">
                      {input.channels.includes(c) && <Check size={12} />}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="ai-instructions">
                추가 요청<small>선택</small>
              </label>
              <textarea
                id="ai-instructions"
                maxLength={3000}
                value={input.instructions}
                onChange={(event) => change('instructions', event.target.value)}
                placeholder="예: 과장된 표현은 빼고, 마지막에 독자에게 질문해 주세요."
              />
            </div>
          </fieldset>
          <p className="ai-privacy">
            <ShieldCheck size={13} />
            원문이 OpenAI로 전송되며 API 사용료가 발생합니다.
          </p>
          {running ? (
            <div className="ai-running" role="status">
              <Loader2 size={18} className="spin" />
              <span>각색 중…</span>
              <button disabled={busy} onClick={() => void cancel()}>
                <Square size={12} />
                취소
              </button>
            </div>
          ) : (
            <button
              className="button primary full ai-generate"
              disabled={busy || !settings?.configured || !input.source.trim()}
              onClick={() => void generate()}
            >
              {busy ? <Loader2 size={17} className="spin" /> : <WandSparkles size={17} />}
              {linkedPlan ? 'AI 초안 만들기' : 'AI로 각색하기'}
              <ArrowRight size={16} />
            </button>
          )}
        </section>
        <section className="ai-result-panel">
          <div className="ai-section-heading">
            <span>02</span>
            <div>
              <h3>각색 결과</h3>
            </div>
          </div>
          {result ? (
            <>
              <div className="ai-result-meta">
                <span>
                  <Sparkles size={13} />
                  {run!.model}
                </span>
                <span>{formatTime(run!.createdAt)}</span>
              </div>
              <div className="preview-channel-tabs">
                {run!.input.channels.map((c) => (
                  <button
                    key={c}
                    className={actualChannel === c ? 'active' : ''}
                    onClick={() => setChannel(c)}
                  >
                    <ChannelIcon channel={c} />
                    {CHANNEL_NAMES[c]}
                  </button>
                ))}
              </div>
              <article className="ai-result-copy">
                <h2>{result.title}</h2>
                <p className="ai-result-excerpt">{result.excerpt}</p>
                <div>{actualChannel === 'website' ? result.body : result[actualChannel]}</div>
              </article>
              <details className="ai-original">
                <summary>원문과 비교하기</summary>
                <p>{run!.input.source}</p>
              </details>
              <details className="ai-edit-summary">
                <summary>편집 요약</summary>
                <div className="ai-formula-result">
                  <h4>공식 적용</h4>
                  {result.formulaSteps.map((step, i) => (
                    <div key={i}>
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <b>{step.stage}</b>
                        <p>{step.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="ai-editorial-notes">
                  <h4>바꾼 점</h4>
                  <ul>
                    {result.changes.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              </details>
              {!!result.reviewNotes.length && (
                <div className="ai-review-notes">
                  <h4>검토할 사항</h4>
                  <ul>
                    {result.reviewNotes.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
              {dirty && (
                <p className="ai-stale-notice" role="status">
                  입력이 변경되었습니다. 다시 각색해 주세요.
                </p>
              )}
              <button
                className="button primary full"
                disabled={busy || dirty}
                onClick={() => void adopt()}
              >
                <ShieldCheck size={16} />
                {run!.contentId ? '검토함에서 열기' : '이 결과를 검토함으로 보내기'}
                <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <div className="ai-result-empty">
              {running ? <Loader2 size={35} className="spin" /> : <WandSparkles size={37} />}
              <h3>
                {running ? '각색 중…' : run?.error ? STATUS[run.status] : '아직 결과가 없습니다.'}
              </h3>
              {run?.error && <p>{run.error}</p>}
            </div>
          )}
        </section>
      </div>
      <section className="ai-history">
        <div className="ai-history-heading">
          <h3>
            <Clock3 size={17} />
            최근 AI 작업
          </h3>
          <button
            className="button"
            onClick={() => {
              if (dirty && !window.confirm('입력한 원문을 비우고 새로 시작할까요?')) return;
              setInput({ ...EMPTY, channels: ['website'] });
              setLinkedPlan(null);
              setSavedInput(JSON.stringify(EMPTY));
              setRun(null);
              request.current = null;
              setError('');
            }}
          >
            <Plus size={14} />새 원문으로 시작
          </button>
        </div>
        {!runs.length ? (
          <p>작업 없음</p>
        ) : (
          <div className="ai-history-list">
            {runs.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  if (dirty && !window.confirm('입력한 내용을 비우고 이전 작업을 열까요?')) return;
                  choose(r);
                }}
              >
                <span className={`ai-run-status ${r.status}`}>{STATUS[r.status]}</span>
                <div>
                  <b>{r.result?.title || r.input.source.slice(0, 70)}</b>
                  <span>
                    {r.input.formula.toUpperCase()} · {r.model} · {formatTime(r.createdAt)}
                  </span>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
      </section>
      {settingsOpen && (
        <AISettings
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(value) => {
            setSettings(value);
            notify('AI 설정을 저장했습니다.');
          }}
        />
      )}
    </div>
  );
}

function AISettings({
  settings,
  onClose,
  onSaved,
}: {
  settings: Settings | null;
  onClose: () => void;
  onSaved: (settings: Settings) => void;
}) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState(settings?.model || 'gpt-4.1-mini');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (remove = false) => {
    setBusy(true);
    setError('');
    try {
      const next = await api<Settings>('/ai/settings', {
        method: remove ? 'DELETE' : 'PUT',
        body: JSON.stringify(
          remove ? {} : { model, ...(key.trim() ? { apiKey: key.trim() } : {}) },
        ),
      });
      setKey('');
      onSaved(next);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="OpenAI 연결 설정" onClose={onClose}>
      <div className="ai-settings">
        <p>API 키는 이 컴퓨터에 저장됩니다.</p>
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
          OpenAI에서 API 키 발급하기 ↗
        </a>
        <div className="field">
          <label htmlFor="openai-key">
            OpenAI API 키
            <small>{settings?.configured ? '저장됨 · 바꿀 때만 입력' : '미연결'}</small>
          </label>
          <input
            id="openai-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={settings?.configured ? '새 키를 입력하면 변경됩니다.' : 'API 키 붙여넣기'}
          />
        </div>
        <div className="field">
          <label htmlFor="openai-model">사용할 모델</label>
          <input
            id="openai-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            maxLength={100}
          />
        </div>
        {settings?.source === 'environment' && <p>실행 환경에 설정된 키를 사용 중입니다.</p>}
        <p className="ai-billing">API 사용료는 ChatGPT 구독과 별도입니다.</p>
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-actions">
        {settings?.source === 'local' && (
          <button className="button danger" disabled={busy} onClick={() => void save(true)}>
            저장된 키 제거
          </button>
        )}
        <button className="button" onClick={onClose}>
          닫기
        </button>
        <button
          className="button primary"
          disabled={busy || (!settings?.configured && !key.trim())}
          onClick={() => void save()}
        >
          {busy ? '저장 중…' : '연결 설정 저장'}
        </button>
      </div>
    </Modal>
  );
}
