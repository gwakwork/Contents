import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  FileText,
  History,
  Info,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  PencilLine,
  Save,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api } from './api';
import { ChannelIcon, Cover, Modal, StatusBadge, formatTime } from './components';
import PlanSummary from './PlanSummary';
import {
  CHANNEL_NAMES,
  COLORS,
  EMPTY,
  STATUSES,
  type Channel,
  type Content,
  type ContentFields,
} from './types';

interface Props {
  content: Content | null;
  onBack: () => void;
  onUpdated: (content: Content) => void;
  onDeleted: (id: string) => void;
  onDirty: (dirty: boolean) => void;
  notify: (message: string) => void;
}
function fieldsOf(content: Content | null): ContentFields {
  return content
    ? {
        title: content.title,
        body: content.body,
        excerpt: content.excerpt,
        channels: content.channels,
        color: content.color,
        variants: content.variants,
      }
    : { ...EMPTY, variants: { ...EMPTY.variants }, channels: [...EMPTY.channels] };
}
export default function Editor({ content, onBack, onUpdated, onDeleted, onDirty, notify }: Props) {
  const [fields, setFields] = useState<ContentFields>(() => fieldsOf(content));
  const [mode, setMode] = useState<'edit' | 'preview'>(
    content?.status === 'review' || content?.status === 'approved' ? 'preview' : 'edit',
  );
  const [previewChannel, setPreviewChannel] = useState<Channel>(content?.channels[0] ?? 'website');
  const [variantChannel, setVariantChannel] = useState<'instagram' | 'threads'>('instagram');
  const [sideTab, setSideTab] = useState('review');
  const [checks, setChecks] = useState({
    accuracy: false,
    rights: false,
    channels: false,
    intent: false,
  });
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(fieldsOf(content));
  useEffect(() => {
    onDirty(dirty);
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, onDirty]);
  useEffect(() => {
    setFields(fieldsOf(content));
    setChecks({ accuracy: false, rights: false, channels: false, intent: false });
  }, [content]);
  const change = <K extends keyof ContentFields>(key: K, value: ContentFields[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setError('');
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<Content>(content ? `/contents/${content.id}` : '/contents', {
        method: content ? 'PUT' : 'POST',
        body: JSON.stringify({ ...fields, revision: content?.revision }),
      });
      onUpdated(result);
      notify(
        content && content.status !== 'draft' && result.status === 'draft'
          ? '변경사항을 저장했어요. 수정된 원고는 다시 검토해 주세요.'
          : '원고를 안전하게 저장했어요.',
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const action = async (name: string) => {
    if (!content) return;
    if (name === 'request_changes' && !note.trim()) {
      setError('수정할 내용을 검토 의견에 적어 주세요.');
      commentRef.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<Content>(`/contents/${content.id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action: name, revision: content.revision, checks, message: note }),
      });
      onUpdated(result);
      setNote('');
      notify(
        name === 'approve'
          ? '최종 승인했어요. 원고는 발행 준비 상태로 보관돼요.'
          : name === 'submit'
            ? '검토를 요청했어요. 미리보기와 체크리스트를 확인해 주세요.'
            : name === 'request_changes'
              ? '수정 요청과 의견을 남겼어요.'
              : '검토 의견을 남겼어요.',
      );
      if (name === 'submit') {
        setMode('preview');
        setSideTab('review');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!content) return;
    setBusy(true);
    try {
      await api(`/contents/${content.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ revision: content.revision }),
      });
      onDeleted(content.id);
    } catch (err) {
      setError((err as Error).message);
      setDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  };
  const exportContent = async () => {
    if (!content) return;
    setBusy(true);
    try {
      const result = await api(`/contents/${content.id}/export`);
      const href = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `narrative-content-${content.id}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      notify('승인된 원고를 내보냈어요.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const activePreview = fields.channels.includes(previewChannel)
    ? previewChannel
    : (fields.channels[0] ?? 'website');
  const previewCopy =
    activePreview === 'website' ? fields.body : fields.variants[activePreview] || fields.body;
  const canAct = !!content && !dirty && !busy;
  return (
    <div className="editor-page">
      <div className="editor-heading">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={17} />
          콘텐츠 목록
        </button>
        <div className="editor-heading-actions">
          {content?.planning && (
            <button className="button" onClick={() => setPlanOpen(true)}>
              <FileText size={14} />
              기획 기준 보기
            </button>
          )}
          {content?.aiSource && (
            <button className="button" onClick={() => setSourceOpen(true)}>
              <FileText size={14} />
              AI 원문 보기
            </button>
          )}
          <span className={`save-indicator ${dirty ? 'unsaved' : ''}`}>
            {dirty ? (
              <>
                <span />
                저장하지 않은 변경사항
              </>
            ) : content ? (
              <>
                <Check size={14} />
                저장됨
              </>
            ) : null}
          </span>
          <button
            className="button primary"
            onClick={() => void save()}
            disabled={busy || (!!content && !dirty)}
          >
            {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {content ? '변경사항 저장' : '임시 저장'}
          </button>
        </div>
      </div>
      <div className="editor-title-row">
        <div>
          <h1>
            {content ? content.title : '새 콘텐츠'}
            {content?.isExample && <span className="example-pill">예시 콘텐츠</span>}
          </h1>
          {content && <p>{formatTime(content.updatedAt)} 수정</p>}
        </div>
        <StatusBadge status={dirty && content ? 'draft' : (content?.status ?? 'draft')} />
      </div>
      {error && (
        <div className="error-message" role="alert">
          <Info size={17} />
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="오류 닫기">
            닫기
          </button>
        </div>
      )}
      {dirty && content && content.status !== 'draft' && (
        <div className="edit-warning">
          <Info size={16} />
          내용을 수정하면 기존 검토·승인이 초기화돼요. 저장 후 다시 검토를 요청해 주세요.
        </div>
      )}
      <div className="editor-layout">
        <div className="editor-main">
          <div className="editor-toolbar">
            <div className="editor-tabs">
              <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>
                <PencilLine size={16} />
                원고 편집
              </button>
              <button
                className={mode === 'preview' ? 'active' : ''}
                onClick={() => setMode('preview')}
              >
                <Eye size={16} />
                미리보기
              </button>
            </div>
            <span className="word-count">본문 {fields.body.length.toLocaleString()}자</span>
          </div>
          {mode === 'edit' ? (
            <div className="editor-form">
              <div className="field">
                <label htmlFor="title">
                  콘텐츠 제목<span>필수</span>
                </label>
                <input
                  id="title"
                  className="title-input"
                  autoFocus={!content}
                  placeholder="제목"
                  maxLength={160}
                  value={fields.title}
                  onChange={(event) => change('title', event.target.value)}
                />
                <span className="field-count">{fields.title.length} / 160</span>
              </div>
              <div className="field">
                <label htmlFor="excerpt">
                  한 줄 소개<small>선택</small>
                </label>
                <input
                  id="excerpt"
                  placeholder="소개"
                  maxLength={300}
                  value={fields.excerpt}
                  onChange={(event) => change('excerpt', event.target.value)}
                />
              </div>
              <div className="field body-field">
                <label htmlFor="body">본문</label>
                <textarea
                  id="body"
                  placeholder={'내용을 입력하세요.'}
                  maxLength={100000}
                  value={fields.body}
                  onChange={(event) => change('body', event.target.value)}
                />
                <div className="textarea-footer">
                  <span>{fields.body.length.toLocaleString()}자</span>
                </div>
              </div>
              <div className="field channel-field">
                <label>
                  발행할 채널<span>1개 이상</span>
                </label>

                <div className="channel-choices">
                  {(Object.keys(CHANNEL_NAMES) as Channel[]).map((channel) => (
                    <label
                      key={channel}
                      className={fields.channels.includes(channel) ? 'selected' : ''}
                    >
                      <input
                        type="checkbox"
                        aria-label={CHANNEL_NAMES[channel]}
                        checked={fields.channels.includes(channel)}
                        onChange={() => {
                          if (fields.channels.includes(channel) && fields.channels.length === 1) {
                            setError('채널을 하나 이상 선택해 주세요.');
                            return;
                          }
                          change(
                            'channels',
                            fields.channels.includes(channel)
                              ? fields.channels.filter((c) => c !== channel)
                              : [...fields.channels, channel],
                          );
                        }}
                      />
                      <ChannelIcon channel={channel} size={18} />
                      <span>{CHANNEL_NAMES[channel]}</span>
                      <span className="check-square">
                        {fields.channels.includes(channel) && <Check size={12} />}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {fields.channels.some((c) => c !== 'website') && (
                <section className="variant-section">
                  <div className="variant-heading">
                    <div>
                      <h3>채널별 원고</h3>
                      <p>비워두면 본문을 사용합니다.</p>
                    </div>
                    <ChevronDown size={17} />
                  </div>
                  <div className="variant-tabs">
                    {(['instagram', 'threads'] as const)
                      .filter((c) => fields.channels.includes(c))
                      .map((c) => (
                        <button
                          key={c}
                          className={
                            (fields.channels.includes(variantChannel)
                              ? variantChannel
                              : fields.channels.find((v) => v !== 'website')) === c
                              ? 'active'
                              : ''
                          }
                          onClick={() => setVariantChannel(c)}
                        >
                          <ChannelIcon channel={c} />
                          {CHANNEL_NAMES[c]}
                        </button>
                      ))}
                  </div>
                  {(() => {
                    const current = (
                      fields.channels.includes(variantChannel)
                        ? variantChannel
                        : fields.channels.find((c) => c !== 'website')
                    ) as 'instagram' | 'threads';
                    const limit = current === 'instagram' ? 2200 : 500;
                    return (
                      <>
                        <textarea
                          aria-label={`${CHANNEL_NAMES[current]} 원고`}
                          placeholder={`${CHANNEL_NAMES[current]}에 어울리는 원고를 적어주세요`}
                          maxLength={limit}
                          value={fields.variants[current]}
                          onChange={(event) =>
                            change('variants', {
                              ...fields.variants,
                              [current]: event.target.value,
                            })
                          }
                        />
                        <div className="variant-count">
                          {fields.variants[current].length} / {limit.toLocaleString()}자
                        </div>
                      </>
                    );
                  })()}
                </section>
              )}
              <div className="field cover-field">
                <label>
                  표지 스타일<small>내부 콘텐츠 구분용</small>
                </label>
                <div className="color-choices">
                  {COLORS.map((color, index) => (
                    <button
                      key={color}
                      className={`color-choice ${color} ${fields.color === color ? 'selected' : ''}`}
                      aria-label={`${['세이지', '피치', '라벤더', '샌드', '블루', '로즈'][index]} 표지`}
                      aria-pressed={fields.color === color}
                      onClick={() => change('color', color)}
                    >
                      {fields.color === color && <Check size={17} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="preview-pane">
              <div className="preview-channel-tabs">
                {fields.channels.map((channel) => (
                  <button
                    key={channel}
                    className={activePreview === channel ? 'active' : ''}
                    onClick={() => setPreviewChannel(channel)}
                  >
                    <ChannelIcon channel={channel} size={16} />
                    {CHANNEL_NAMES[channel]}
                  </button>
                ))}
              </div>
              <div
                className={`article-preview ${activePreview !== 'website' ? 'social-preview' : ''}`}
              >
                <Cover color={fields.color} title={fields.title} />
                <div className="preview-article-body">
                  <h2>{fields.title || '이야기의 제목이 들어갈 자리'}</h2>
                  {fields.excerpt && <p className="article-excerpt">{fields.excerpt}</p>}
                  <div className="article-text">{previewCopy || '본문이 없습니다.'}</div>
                  {activePreview !== 'website' && (
                    <div
                      className={`social-character-count ${previewCopy.length > (activePreview === 'instagram' ? 2200 : 500) ? 'over-limit' : ''}`}
                    >
                      {previewCopy.length.toLocaleString()} /{' '}
                      {activePreview === 'instagram' ? '2,200' : '500'}자
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <aside className="review-panel">
          <div className="review-panel-tabs">
            <button
              className={sideTab === 'review' ? 'active' : ''}
              onClick={() => setSideTab('review')}
            >
              <ShieldCheck size={16} />
              검토 및 승인
            </button>
            <button
              className={sideTab === 'history' ? 'active' : ''}
              onClick={() => setSideTab('history')}
            >
              <History size={16} />
              변경 이력{content && <span>{content.history.length}</span>}
            </button>
          </div>
          {sideTab === 'review' ? (
            <>
              <div className="review-status">
                <span className={`review-status-icon ${content?.status ?? 'draft'}`}>
                  {content?.status === 'approved' ? (
                    <CheckCheck size={25} />
                  ) : content?.status === 'review' ? (
                    <Clock3 size={25} />
                  ) : content?.status === 'changes' ? (
                    <MessageSquareText size={25} />
                  ) : (
                    <PencilLine size={25} />
                  )}
                </span>
                <h2>{STATUSES[content?.status ?? 'draft'].label}</h2>
              </div>
              {content?.status === 'review' ? (
                <div className="checklist-section">
                  <h3>발행 전 체크리스트</h3>
                  {content.planning && (
                    <details className="review-plan-brief">
                      <summary>기획 기준</summary>
                      <PlanSummary plan={content.planning} compact />
                    </details>
                  )}

                  {[
                    {
                      id: 'accuracy' as const,
                      title: '내용과 오탈자를 확인했어요',
                    },
                    {
                      id: 'rights' as const,
                      title: '사용 권리를 확인했어요',
                    },
                    {
                      id: 'channels' as const,
                      title: '채널별 원고를 확인했어요',
                    },
                    ...(content.planning
                      ? [{ id: 'intent' as const, title: '기획 목적과 메시지를 확인했어요' }]
                      : []),
                  ].map(({ id, title }) => (
                    <label className={`checklist-item ${checks[id] ? 'checked' : ''}`} key={id}>
                      <input
                        type="checkbox"
                        checked={checks[id]}
                        disabled={dirty || busy}
                        onChange={(event) =>
                          setChecks((prev) => ({ ...prev, [id]: event.target.checked }))
                        }
                      />
                      <span className="check-square">{checks[id] && <Check size={12} />}</span>
                      <span>
                        <b>{title}</b>
                      </span>
                    </label>
                  ))}
                  <button
                    className="button primary full"
                    disabled={
                      !canAct ||
                      !(
                        content.planning
                          ? Object.values(checks)
                          : [checks.accuracy, checks.rights, checks.channels]
                      ).every(Boolean)
                    }
                    onClick={() => void action('approve')}
                  >
                    <CheckCheck size={17} />
                    최종 승인
                  </button>
                  <button
                    className="button full"
                    disabled={!canAct}
                    onClick={() => void action('request_changes')}
                  >
                    <MessageSquareText size={16} />
                    수정 요청
                  </button>
                </div>
              ) : content?.status === 'approved' ? (
                <div className="approved-section">
                  <p className="approved-at">
                    {content.approvedAt && formatTime(content.approvedAt)} 승인
                  </p>
                  <button
                    className="button full"
                    disabled={!canAct}
                    onClick={() => void exportContent()}
                  >
                    <Download size={16} />
                    승인 원고 내보내기
                  </button>
                  <button className="button full publish-disabled" disabled>
                    <LockKeyhole size={15} />
                    채널 연결 후 발행 가능
                  </button>
                </div>
              ) : (
                <div className="submit-section">
                  {content?.status === 'changes' && (
                    <div className="change-request">
                      <MessageSquareText size={17} />
                      <b>이 부분을 수정해 주세요</b>
                      <p>
                        {
                          [...content.history]
                            .reverse()
                            .find((event) => event.action === 'changes_requested')?.message
                        }
                      </p>
                    </div>
                  )}
                  <button
                    className="button primary full"
                    disabled={!canAct}
                    onClick={() => void action('submit')}
                  >
                    <Send size={16} />
                    {content?.status === 'changes' ? '다시 검토 요청' : '검토 요청'}
                    <ArrowRight size={15} />
                  </button>
                  {!content && <span className="review-small-note">먼저 저장해 주세요.</span>}
                </div>
              )}
              {dirty && (
                <p className="dirty-hint">
                  <Save size={13} />
                  검토하려면 변경사항을 저장하세요.
                </p>
              )}
              <div className="review-comment">
                <h3>
                  <MessageSquareText size={16} />
                  검토 의견
                </h3>
                <textarea
                  ref={commentRef}
                  aria-label="검토 의견"
                  placeholder="수정할 점이나 기억할 내용을 남겨주세요"
                  maxLength={3000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <button
                  className="button full"
                  disabled={!canAct || !note.trim()}
                  onClick={() => void action('note')}
                >
                  의견 남기기
                </button>
                {content &&
                  [...content.history]
                    .reverse()
                    .filter((event) => ['note', 'changes_requested'].includes(event.action))
                    .map((event) => (
                      <div className="comment-item" key={event.id}>
                        <span className="tiny-avatar">나</span>
                        <div>
                          <b>
                            나의 의견 <small>{formatTime(event.at)}</small>
                          </b>
                          <p>{event.message}</p>
                          {event.action === 'changes_requested' && (
                            <span className="comment-status">수정 요청</span>
                          )}
                        </div>
                      </div>
                    ))}
              </div>
            </>
          ) : (
            <div className="history-panel">
              <h3>변경 이력</h3>
              {!content ? (
                <div className="history-empty">
                  <History size={25} />
                  <p>기록 없음</p>
                </div>
              ) : (
                <ol>
                  {[...content.history].reverse().map((event) => (
                    <li key={event.id}>
                      <span className={`history-dot ${event.action}`}>
                        {event.action === 'approved' ? <Check size={11} /> : <span />}
                      </span>
                      <div>
                        <b>
                          {
                            (
                              {
                                created: '콘텐츠 작성',
                                edited: '원고 수정',
                                submitted: '검토 요청',
                                approved: '최종 승인',
                                changes_requested: '수정 요청',
                                note: '검토 의견',
                              } as Record<string, string>
                            )[event.action]
                          }
                        </b>
                        <p>{event.message}</p>
                        <time>{formatTime(event.at)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          <div className="review-panel-bottom">
            {content && (
              <button className="delete-link" onClick={() => setDeleteOpen(true)} disabled={busy}>
                <Trash2 size={13} />
                콘텐츠 삭제
              </button>
            )}
          </div>
        </aside>
      </div>
      {planOpen && content?.planning && (
        <Modal title="기획 기준" onClose={() => setPlanOpen(false)}>
          <h3 className="plan-snapshot-title">{content.planning.fields.topic}</h3>
          <p className="plan-snapshot-version">생성에 사용한 기획 · v{content.planning.revision}</p>
          <PlanSummary plan={content.planning} />
          <div className="modal-actions">
            <button className="button primary" onClick={() => setPlanOpen(false)}>
              확인
            </button>
          </div>
        </Modal>
      )}
      {sourceOpen && content?.aiSource && (
        <Modal title="AI가 각색한 원문" onClose={() => setSourceOpen(false)}>
          <div className="ai-source-details">
            <p>
              {content.aiSource.formula.toUpperCase()} · {content.aiSource.model} ·{' '}
              {formatTime(content.aiSource.createdAt)}
            </p>
            <h3>원문</h3>
            <pre>{content.aiSource.source}</pre>
            {content.aiSource.instructions && (
              <>
                <h3>추가 요청·공식</h3>
                <pre>{content.aiSource.instructions}</pre>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button className="button primary" onClick={() => setSourceOpen(false)}>
              확인했어요
            </button>
          </div>
        </Modal>
      )}
      {deleteOpen && (
        <Modal title="콘텐츠를 삭제할까요?" onClose={() => setDeleteOpen(false)}>
          <p className="modal-description">
            ‘{content?.title}’ 원고와 검토 이력이 함께 삭제돼요. 이 작업은 되돌릴 수 없어요.
          </p>
          <div className="modal-actions">
            <button className="button" onClick={() => setDeleteOpen(false)}>
              취소
            </button>
            <button className="button danger" disabled={busy} onClick={() => void remove()}>
              {busy ? '삭제 중…' : '콘텐츠 삭제'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
