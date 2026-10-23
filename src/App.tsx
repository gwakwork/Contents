import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Download,
  FileText,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  List,
  Loader2,
  Menu,
  MessageSquareText,
  Plus,
  Route,
  Search,
  Settings2,
  Sparkles,
  Unplug,
  Upload,
  X,
} from 'lucide-react';
import { api } from './api';
import {
  Brand,
  ChannelBadges,
  ChannelIcon,
  Cover,
  Modal,
  StatusBadge,
  formatDate,
} from './components';
import { CHANNEL_NAMES, STATUSES, type Channel, type Content, type Status } from './types';
import Editor from './Editor';
import AIStudio from './AIStudio';
import Planner from './Planner';
import { createPortal } from 'react-dom';
import type { Plan } from '../server/planning.mjs';
import { LOCAL_MODE, createLocalBackup, restoreLocalBackup } from './local-api';

type Page = 'plans' | 'all' | 'review' | 'approved' | 'channels' | 'ai';
export default function App() {
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState<Page>('plans');
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [aiPlan, setAIPlan] = useState<Plan | null>(null);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const [selected, setSelected] = useState<Content | 'new' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [channel, setChannel] = useState<Channel | 'all'>('all');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState('grid');
  const [toast, setToast] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [removeExamples, setRemoveExamples] = useState(false);
  const [localHelp, setLocalHelp] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 5000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setContents(await api<Content[]>('/contents'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(STATUSES) as Status[]).map((key) => [
          key,
          contents.filter((c) => c.status === key).length,
        ]),
      ) as Record<Status, number>,
    [contents],
  );
  const navigate = (nextPage: Page, content: Content | 'new' | null = null) => {
    if (dirty && !window.confirm('저장하지 않은 내용이 있어요. 저장하지 않고 나갈까요?')) return;
    setNavigationVersion((version) => version + 1);
    setSelected(content);
    if (nextPage === 'ai') setAIPlan(null);
    if (nextPage === 'plans') setPlanningId(null);
    setDirty(false);
    setPage(nextPage);
    setStatus('all');
    setSearch('');
    setMobileOpen(false);
  };
  const updated = (content: Content) => {
    setContents((prev) => [content, ...prev.filter((c) => c.id !== content.id)]);
    setSelected(content);
  };
  const deleted = (id: string) => {
    setContents((prev) => prev.filter((c) => c.id !== id));
    setSelected(null);
    setDirty(false);
    notify('콘텐츠를 삭제했어요.');
  };
  const addExamples = async () => {
    setBusy(true);
    try {
      setContents(await api<Content[]>('/examples', { method: 'POST', body: '{}' }));
      notify('예시 콘텐츠 6개를 불러왔어요. 자유롭게 살펴보세요.');
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const clearExamples = async () => {
    setBusy(true);
    try {
      await api('/examples', { method: 'DELETE', body: '{}' });
      setContents((prev) => prev.filter((c) => !c.isExample));
      setRemoveExamples(false);
      notify('예시만 정리했어요. 직접 작성한 글은 그대로 있어요.');
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const backup = async () => {
    if (dirty) {
      notify('변경사항 저장이 끝난 뒤 백업해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const data = LOCAL_MODE ? await createLocalBackup() : await api('/backup');
      const href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = href;
      link.download = `narrative-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      notify('기획과 원고를 백업 파일로 내려받았어요.');
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const restore = async (file: File) => {
    if (dirty) {
      notify('변경사항 저장이 끝난 뒤 가져와 주세요.');
      return;
    }
    setBusy(true);
    setRestoring(true);
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error('백업 파일은 25MB 이하만 가져올 수 있어요.');
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error('Narrative에서 내려받은 JSON 백업 파일을 선택해 주세요.');
      }
      const summary = LOCAL_MODE
        ? await restoreLocalBackup(data)
        : await api<{
            added: number;
            copies: number;
            skipped: number;
            plans?: { added: number; copies: number; skipped: number };
          }>('/backup', {
            method: 'POST',
            body: JSON.stringify(data),
          });
      setContents(await api<Content[]>('/contents'));
      setSelected(null);
      setDirty(false);
      setPage('all');
      setSearch('');
      setStatus('all');
      setChannel('all');
      notify(
        `${summary.added}개 복원, ${summary.copies}개는 별도 복원본으로 추가했어요. 같은 원고 ${summary.skipped}개는 그대로 두었어요.${summary.plans ? ` 기획 ${summary.plans.added}개 복원, ${summary.plans.copies}개 복원본, ${summary.plans.skipped}개 유지.` : ''}`,
      );
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setRestoring(false);
      setBusy(false);
      if (importInput.current) importInput.current.value = '';
    }
  };
  const base = contents.filter((c) =>
    page === 'review'
      ? ['review', 'changes'].includes(c.status)
      : page === 'approved'
        ? c.status === 'approved'
        : true,
  );
  const filtered = base
    .filter(
      (c) =>
        (status === 'all' || c.status === status) &&
        (channel === 'all' || c.channels.includes(channel)) &&
        `${c.title} ${c.body} ${c.excerpt}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'oldest'
        ? a.updatedAt.localeCompare(b.updatedAt)
        : sort === 'title'
          ? a.title.localeCompare(b.title, 'ko')
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const title =
    page === 'plans'
      ? '콘텐츠 기획'
      : page === 'ai'
        ? 'AI 작업실'
        : page === 'review'
          ? '나의 검토함'
          : page === 'approved'
            ? '승인된 콘텐츠'
            : page === 'channels'
              ? '발행 채널'
              : '모든 콘텐츠';
  const navItems = [
    { id: 'all' as Page, label: '모든 콘텐츠', icon: FolderOpen, count: contents.length },
    {
      id: 'review' as Page,
      label: '나의 검토함',
      icon: MessageSquareText,
      count: counts.review + counts.changes,
    },
    { id: 'approved' as Page, label: '승인된 콘텐츠', icon: CheckCheck, count: counts.approved },
  ];
  return (
    <div className="app-shell" inert={restoring} aria-busy={restoring}>
      {restoring &&
        createPortal(
          <div className="backup-progress" role="status" aria-live="polite">
            <div>
              <Loader2 size={20} className="spin" aria-hidden="true" />
              <span>백업을 가져오고 있습니다.</span>
            </div>
          </div>,
          document.body,
        )}
      {mobileOpen && (
        <button
          aria-label="메뉴 닫기"
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <button
          className="brand-button"
          onClick={() => navigate('plans')}
          aria-label="Narrative 홈"
        >
          <Brand />
        </button>
        <nav aria-label="주 메뉴">
          <button
            className={`nav-item ${page === 'plans' && !selected ? 'active' : ''}`}
            onClick={() => navigate('plans')}
          >
            <Route size={19} />
            <span>콘텐츠 기획</span>
          </button>
          <button
            className={`nav-item ${page === 'ai' && !selected ? 'active' : ''}`}
            onClick={() => navigate('ai')}
          >
            <Sparkles size={19} />
            <span>AI 작업실</span>
          </button>
          <div className="nav-label">라이브러리</div>
          {navItems.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              className={`nav-item ${page === id && !selected ? 'active' : ''}`}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              <small>{count}</small>
            </button>
          ))}
          <div className="nav-divider" />
          <button
            className={`nav-item ${page === 'channels' ? 'active' : ''}`}
            onClick={() => navigate('channels')}
          >
            <Unplug size={19} />
            <span>발행 채널</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <HardDrive size={16} />
          <span>내 컴퓨터</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="메뉴 열기"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>{selected ? '콘텐츠 편집' : title}</span>
          </div>
          <div className="local-tools">
            <button
              aria-label="백업 저장"
              title="백업 저장"
              disabled={busy}
              onClick={() => void backup()}
            >
              <Download size={16} />
              <span>백업 저장</span>
            </button>
            <button
              aria-label="백업 가져오기"
              title="백업 가져오기"
              disabled={busy}
              onClick={() => {
                if (dirty) {
                  notify('변경사항 저장이 끝난 뒤 가져와 주세요.');
                  return;
                }
                importInput.current?.click();
              }}
            >
              <Upload size={16} />
              <span>백업 가져오기</span>
            </button>
            <input
              type="file"
              ref={importInput}
              accept=".json,application/json"
              aria-label="가져올 백업 파일"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void restore(file);
              }}
            />
          </div>
        </header>
        <main>
          {LOCAL_MODE && (
            <div className="local-banner">
              <HardDrive size={15} />
              <span>이 브라우저에 저장됩니다.</span>
              <button onClick={() => setLocalHelp(true)}>
                저장 안내
                <CircleHelp size={14} />
              </button>
            </div>
          )}
          {selected ? (
            <Editor
              key={selected === 'new' ? 'new' : selected.id}
              content={selected === 'new' ? null : selected}
              onBack={() => navigate(page)}
              onUpdated={updated}
              onDeleted={deleted}
              onDirty={setDirty}
              notify={notify}
            />
          ) : (
            <div className="page-content">
              <div className="page-heading">
                <h1>{title}</h1>
                {!['plans', 'ai', 'channels'].includes(page) && (
                  <div className="page-actions">
                    <button className="button" onClick={() => navigate(page, 'new')}>
                      <Plus size={17} />새 콘텐츠 작성
                    </button>
                    <button className="button primary" onClick={() => navigate('ai')}>
                      <Sparkles size={17} />
                      AI 작업실 열기
                    </button>
                  </div>
                )}
              </div>
              {page === 'plans' ? (
                <Planner
                  key={`plans:${navigationVersion}`}
                  initialPlanId={planningId}
                  onCreateContent={(plan) => {
                    setAIPlan(plan);
                    setDirty(false);
                    setPage('ai');
                  }}
                  onDirty={setDirty}
                  notify={notify}
                />
              ) : page === 'ai' ? (
                <AIStudio
                  key={`${aiPlan ? `${aiPlan.id}:${aiPlan.revision}` : 'standalone'}:${navigationVersion}`}
                  initialPlan={aiPlan ?? undefined}
                  onPlanEdit={(plan) => {
                    if (
                      dirty &&
                      !window.confirm('저장하지 않은 AI 입력을 두고 기획으로 돌아갈까요?')
                    )
                      return;
                    setPlanningId(plan.id);
                    setDirty(false);
                    setPage('plans');
                  }}
                  onAdopt={(content) => {
                    setDirty(false);
                    updated(content);
                  }}
                  onDirty={setDirty}
                  notify={notify}
                />
              ) : page === 'channels' ? (
                <ChannelsPage />
              ) : (
                <section className="library" aria-label="콘텐츠 목록">
                  <div className="library-top">
                    <div className="status-tabs" role="group" aria-label="콘텐츠 상태 필터">
                      <button
                        className={status === 'all' ? 'active' : ''}
                        onClick={() => setStatus('all')}
                      >
                        전체<span>{base.length}</span>
                      </button>
                      {(Object.keys(STATUSES) as Status[])
                        .filter((s) =>
                          page === 'review'
                            ? ['review', 'changes'].includes(s)
                            : page === 'approved'
                              ? s === 'approved'
                              : true,
                        )
                        .map((s) => (
                          <button
                            key={s}
                            className={status === s ? 'active' : ''}
                            onClick={() => setStatus(s)}
                          >
                            {STATUSES[s].label}
                            <span>{base.filter((c) => c.status === s).length}</span>
                          </button>
                        ))}
                    </div>
                    <div className="view-toggle" aria-label="목록 보기 방식">
                      <button
                        className={view === 'grid' ? 'active' : ''}
                        aria-label="카드로 보기"
                        aria-pressed={view === 'grid'}
                        onClick={() => setView('grid')}
                      >
                        <LayoutGrid size={17} />
                      </button>
                      <button
                        className={view === 'list' ? 'active' : ''}
                        aria-label="리스트로 보기"
                        aria-pressed={view === 'list'}
                        onClick={() => setView('list')}
                      >
                        <List size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="filter-bar">
                    <label className="search-input">
                      <Search size={17} />
                      <input
                        aria-label="콘텐츠 검색"
                        placeholder="콘텐츠 검색"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                      {search && (
                        <button
                          className="icon-button"
                          aria-label="검색 지우기"
                          onClick={() => setSearch('')}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </label>
                    <div className="filter-options">
                      <label className="select-wrap">
                        <Settings2 size={15} />
                        <select
                          aria-label="발행 채널 필터"
                          value={channel}
                          onChange={(event) => setChannel(event.target.value as Channel | 'all')}
                        >
                          <option value="all">모든 채널</option>
                          {Object.entries(CHANNEL_NAMES).map(([key, name]) => (
                            <option key={key} value={key}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={13} />
                      </label>
                      <label className="select-wrap sort">
                        <ArrowDownWideNarrow size={16} />
                        <select
                          aria-label="정렬 방식"
                          value={sort}
                          onChange={(event) => setSort(event.target.value)}
                        >
                          <option value="newest">최근 수정순</option>
                          <option value="oldest">오래된 수정순</option>
                          <option value="title">제목순</option>
                        </select>
                        <ChevronDown size={13} />
                      </label>
                    </div>
                  </div>
                  {contents.some((c) => c.isExample) && (
                    <div className="example-notice">
                      <span>예시 콘텐츠</span>
                      <button onClick={() => setRemoveExamples(true)}>
                        예시 정리
                        <X size={13} />
                      </button>
                    </div>
                  )}
                  {loading ? (
                    <div className="empty-state">
                      <Loader2 className="spin" size={26} />
                      <h2>불러오는 중</h2>
                    </div>
                  ) : error ? (
                    <div className="empty-state">
                      <Unplug size={30} />
                      <h2>콘텐츠를 열 수 없습니다.</h2>
                      <p>{error}</p>
                      <button className="button" onClick={() => void load()}>
                        다시 불러오기
                      </button>
                    </div>
                  ) : !contents.length ? (
                    <div className="empty-state first-use">
                      <div className="empty-art">
                        <FileText size={32} />
                      </div>
                      <h2>아직 콘텐츠가 없습니다.</h2>
                      <div className="empty-actions">
                        <button className="button primary" onClick={() => navigate(page, 'new')}>
                          <Plus size={17} />첫 콘텐츠 작성하기
                        </button>
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => void addExamples()}
                        >
                          {busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                          예시 콘텐츠 둘러보기
                        </button>
                      </div>
                    </div>
                  ) : !filtered.length ? (
                    <div className="empty-state">
                      <Search size={30} />
                      <h2>검색 결과가 없습니다.</h2>
                      <button
                        className="button"
                        onClick={() => {
                          setSearch('');
                          setChannel('all');
                          setStatus('all');
                        }}
                      >
                        필터 초기화
                      </button>
                    </div>
                  ) : (
                    <div className={`content-grid ${view === 'list' ? 'list-view' : ''}`}>
                      {filtered.map((content) => (
                        <button
                          className="content-card"
                          key={content.id}
                          onClick={() => {
                            setSelected(content);
                            setDirty(false);
                          }}
                        >
                          <div className="card-cover">
                            <Cover
                              color={content.color}
                              title={content.title}
                              compact={view === 'list'}
                            />
                            {content.isExample && <span className="example-tag">예시</span>}
                            <span className="card-open">
                              <ArrowUpRight size={19} />
                            </span>
                          </div>
                          <div className="card-body">
                            <div className="card-status-row">
                              <StatusBadge status={content.status} />
                              <span className="content-type">
                                {content.channels.length > 1
                                  ? '멀티 채널'
                                  : CHANNEL_NAMES[content.channels[0]]}
                              </span>
                            </div>
                            <h2>{content.title}</h2>
                            <p>{content.excerpt || content.body}</p>
                            <ChannelBadges channels={content.channels} />
                            <div className="card-footer">
                              <span>{formatDate(content.updatedAt)} 수정</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {!loading && !error && !!contents.length && (
                    <div className="library-footer">총 {filtered.length}개</div>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button aria-label="알림 닫기" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {localHelp && (
        <Modal title="저장 안내" onClose={() => setLocalHelp(false)}>
          <div className="local-help">
            <p>같은 컴퓨터와 브라우저에서 파일을 열어 주세요.</p>
            <p>브라우저 데이터를 지우거나 시크릿 창을 닫으면 원고가 사라질 수 있습니다.</p>
            <p>다른 곳으로 옮기기 전에는 백업을 저장하고, 새 화면에서 가져오세요.</p>
          </div>
          <div className="modal-actions">
            <button className="button primary" onClick={() => setLocalHelp(false)}>
              확인
            </button>
          </div>
        </Modal>
      )}
      {removeExamples && (
        <Modal title="예시 콘텐츠 삭제" onClose={() => setRemoveExamples(false)}>
          <p className="modal-description">예시만 삭제합니다. 직접 작성한 글은 유지됩니다.</p>
          <div className="modal-actions">
            <button className="button" onClick={() => setRemoveExamples(false)}>
              취소
            </button>
            <button className="button danger" disabled={busy} onClick={() => void clearExamples()}>
              예시만 삭제
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ChannelsPage() {
  return (
    <div className="channels-grid">
      {(Object.keys(CHANNEL_NAMES) as Channel[]).map((channel) => (
        <article className="channel-card" key={channel}>
          <span className={`channel-logo ${channel}`}>
            <ChannelIcon channel={channel} size={27} />
          </span>
          <span className="connection-badge">미연결</span>
          <h2>{CHANNEL_NAMES[channel]}</h2>
          <div className="channel-capabilities">
            <span>
              <Check size={14} />
              원고 작성
            </span>
            <span>
              <Check size={14} />
              검토·승인
            </span>
          </div>
          <button className="button" disabled>
            <Unplug size={15} />
            업로드 연결 예정
          </button>
        </article>
      ))}
    </div>
  );
}
