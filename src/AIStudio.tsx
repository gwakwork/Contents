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

interface Formula {
  id: string;
  name: string;
  summary: string;
  stages: string[];
}
interface AIInput {
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
}: {
  onAdopt: (content: Content) => void;
  onDirty: (dirty: boolean) => void;
  notify: (message: string) => void;
}) {
  const [input, setInput] = useState<AIInput>({ ...EMPTY, channels: ['website'] });
  const [savedInput, setSavedInput] = useState(JSON.stringify(EMPTY));
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
        if (r[0]) choose(r[0]);
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
      notify('AI 원고를 검토함으로 보냈어요. 원문과 결과를 확인한 뒤 승인해 주세요.');
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
        <h2>AI 각색은 Mac 실행 버전에서 사용할 수 있어요</h2>
        <p>
          지금 열어 둔 HTML은 오프라인 원고 관리 버전이에요.
          <br />
          AI 연결은 API 키를 브라우저에 넣지 않는 Mac 실행 버전을 사용해 주세요.
        </p>
        <span>기존 원고는 ‘백업 저장’으로 보관하고 새 버전에서 가져올 수 있어요.</span>
      </div>
    );
  const formula = formulas.find((f) => f.id === input.formula);
  const result = run?.status === 'completed' ? run.result : null;
  const actualChannel = run?.input.channels.includes(channel)
    ? channel
    : (run?.input.channels[0] ?? 'website');
  return (
    <div className="ai-studio">
      <div className="ai-intro">
        <div>
          <span className="ai-intro-icon">
            <WandSparkles size={23} />
          </span>
          <div>
            <h2>원문 하나로, 채널에 맞는 새로운 콘텐츠</h2>
            <p>공식에 맞게 AI가 각색하고, 마지막 결정은 내가 해요.</p>
          </div>
        </div>
        <button className="button" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={15} />
          AI 연결 설정
        </button>
      </div>
      <div className={`ai-connection ${settings?.configured ? 'configured' : ''}`}>
        <span>
          <KeyRound size={14} />
          {settings?.configured
            ? `API 키 저장됨 · ${settings.model}`
            : 'OpenAI API 키를 먼저 연결해 주세요'}
        </span>
        <button onClick={() => setSettingsOpen(true)}>
          {settings?.configured ? '설정 변경' : '키 연결하기'}
          <ChevronRight size={13} />
        </button>
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <div className="ai-workspace">
        <section className="ai-input-panel">
          <div className="ai-section-heading">
            <span>01</span>
            <div>
              <h3>원문과 각색 방법</h3>
              <p>메모, 기존 글, 참고 내용을 자유롭게 넣어 주세요.</p>
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
                placeholder="AI가 재가공할 원문을 붙여 넣어 주세요. 원문에 없는 사실을 임의로 추가하지 않도록 요청해요."
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
              <p className="formula-description">{formula?.summary}</p>
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
            ‘AI로 각색하기’를 누르면 원문과 요청이 OpenAI로 전송되며 API 사용료가 발생해요. 사실과
            표현은 결과에서 다시 확인해 주세요.
          </p>
          {running ? (
            <div className="ai-running" role="status">
              <Loader2 size={18} className="spin" />
              <span>AI가 공식을 적용해 원고를 다듬고 있어요.</span>
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
              {busy ? <Loader2 size={17} className="spin" /> : <WandSparkles size={17} />}AI로
              각색하기
              <ArrowRight size={16} />
            </button>
          )}
        </section>
        <section className="ai-result-panel">
          <div className="ai-section-heading">
            <span>02</span>
            <div>
              <h3>AI 결과 확인</h3>
              <p>원문과 비교하고, 검토함에서 수정·승인해 주세요.</p>
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
              <div className="ai-formula-result">
                <h4>공식을 이렇게 적용했어요</h4>
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
                <h4>검토할 때 확인해 주세요</h4>
                {result.reviewNotes.length ? (
                  <ul>
                    {result.reviewNotes.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                ) : (
                  <p>AI가 별도 항목을 남기지 않았어도 사실과 표현을 직접 확인해 주세요.</p>
                )}
              </div>
              {dirty && (
                <p className="ai-stale-notice" role="status">
                  원문이나 옵션을 바꿨어요. 아래 결과는 이전 요청으로 만든 원고예요. 새 설정으로
                  다시 각색해 주세요.
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
              <p className="ai-small-note">최종 승인 전에는 어디에도 발행되지 않아요.</p>
            </>
          ) : (
            <div className="ai-result-empty">
              {running ? <Loader2 size={35} className="spin" /> : <WandSparkles size={37} />}
              <h3>
                {running
                  ? '새로운 원고를 만들고 있어요'
                  : run?.error
                    ? STATUS[run.status] + '된 작업이에요'
                    : '원문이 새로운 콘텐츠가 되는 곳'}
              </h3>
              <p>
                {run?.error ||
                  '왼쪽에 원문을 넣고 공식을 골라 주세요.\n각색 결과와 적용한 공식을 여기서 확인할 수 있어요.'}
              </p>
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
          <p>AI 작업을 시작하면 원문과 결과가 이 컴퓨터에 기록돼요.</p>
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
            notify('AI 설정을 저장했어요. 실제 결과는 AI 작업에서 확인할 수 있어요.');
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
        <p>
          키는 이 컴퓨터의 로컬 설정 파일에 보관해요. 브라우저 저장 공간, 원고 백업, GitHub에는
          포함하지 않아요.
        </p>
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
            placeholder={
              settings?.configured
                ? '기존 키는 표시하지 않아요'
                : '발급받은 API 키를 붙여 넣어 주세요'
            }
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
          <p className="field-help">
            기본은 gpt-4.1-mini예요. 이용 가능한 모델 이름으로 변경할 수 있어요.
          </p>
        </div>
        {settings?.source === 'environment' && (
          <p>
            현재는 실행 환경의 키가 우선 적용돼요. 환경의 키를 바꾸려면 앱을 다시 시작해 주세요.
          </p>
        )}
        <p className="ai-billing">
          ChatGPT Plus·Pro 구독과 API 요금은 별도예요. 키 저장 자체는 AI 요청을 보내지 않아요.
        </p>
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
