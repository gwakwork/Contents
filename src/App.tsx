import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  LayoutGrid,
  HardDrive,
  List,
  Loader2,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
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
  StepFlow,
  formatDate,
} from './components';
import { CHANNEL_NAMES, STATUSES, type Channel, type Content, type Status } from './types';
import Editor from './Editor';
import { LOCAL_MODE, createLocalBackup, restoreLocalBackup } from './local-api';

type Page = 'all' | 'review' | 'approved' | 'channels' | 'guide';
export default function App() {
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState<Page>('all');
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
    setSelected(content);
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
      notify('편집 중인 글을 먼저 저장한 뒤 백업해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const data = await createLocalBackup();
      const href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = href;
      link.download = `moa-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      notify('전체 원고와 검토 이력을 백업 파일로 내려받았어요.');
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const restore = async (file: File) => {
    if (dirty) {
      notify('편집 중인 글을 먼저 저장한 뒤 가져와 주세요.');
      return;
    }
    setBusy(true);
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error('백업 파일은 25MB 이하만 가져올 수 있어요.');
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error('모아에서 내려받은 JSON 백업 파일을 선택해 주세요.');
      }
      const summary = await restoreLocalBackup(data);
      setContents(await api<Content[]>('/contents'));
      setSelected(null);
      setDirty(false);
      setPage('all');
      setSearch('');
      setStatus('all');
      setChannel('all');
      notify(
        `${summary.added}개 복원, ${summary.copies}개는 별도 복원본으로 추가했어요. 같은 원고 ${summary.skipped}개는 그대로 두었어요.`,
      );
    } catch (err) {
      notify((err as Error).message);
    } finally {
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
    page === 'review'
      ? '나의 검토함'
      : page === 'approved'
        ? '승인된 콘텐츠'
        : page === 'channels'
          ? '발행 채널'
          : page === 'guide'
            ? '이용 가이드'
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
    <div className="app-shell">
      {mobileOpen && (
        <button
          aria-label="메뉴 닫기"
          className="sidebar-scrim"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <button className="brand-button" onClick={() => navigate('all')} aria-label="모아 홈">
          <Brand />
        </button>
        <div className="workspace">
          <span className="workspace-avatar">M</span>
          <div>
            <b>내 워크스페이스</b>
            <span>Personal workspace</span>
          </div>
          <ShieldCheck size={17} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="주 메뉴">
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
            <i className="soon-dot" />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <ShieldCheck size={20} />
            </span>
            <b>나의 승인으로 완성되는 콘텐츠</b>
            <p>
              차근차근 검토하고,
              <br />
              준비가 되면 세상에 전하세요.
            </p>
            <button onClick={() => navigate('guide')}>
              사용 방법 알아보기 <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={`nav-item help-link ${page === 'guide' ? 'active' : ''}`}
            onClick={() => navigate('guide')}
          >
            <CircleHelp size={18} />
            <span>이용 가이드</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-user">
            <span className="user-avatar">나</span>
            <div>
              <b>나의 작업 공간</b>
              <span>콘텐츠 에디터</span>
            </div>
            <span className="online-indicator" />
          </div>
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
            <span>워크스페이스</span>
            <ChevronRight size={14} />
            <b>{selected ? (selected === 'new' ? '새 콘텐츠 작성' : '콘텐츠 상세') : title}</b>
          </div>
          <div className="topbar-right">
            {LOCAL_MODE && (
              <div className="local-tools">
                <button
                  aria-label="백업 저장"
                  title="전체 원고와 검토 이력 백업 저장"
                  disabled={busy}
                  onClick={() => void backup()}
                >
                  <Download size={15} />
                  <span>백업 저장</span>
                </button>
                <button
                  aria-label="백업 가져오기"
                  title="백업 파일 가져오기"
                  disabled={busy}
                  onClick={() => {
                    if (dirty) {
                      notify('편집 중인 글을 먼저 저장한 뒤 가져와 주세요.');
                      return;
                    }
                    importInput.current?.click();
                  }}
                >
                  <Upload size={15} />
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
            )}
            <span className="private-label">
              {LOCAL_MODE ? <HardDrive size={14} /> : <ShieldCheck size={14} />}
              {LOCAL_MODE ? '내 컴퓨터에 저장' : '나만의 검토 공간'}
            </span>
            <span className="user-avatar small">나</span>
          </div>
        </header>
        <main>
          {LOCAL_MODE && (
            <div className="local-banner">
              <HardDrive size={17} />
              <span>
                글은 이 컴퓨터의 브라우저에 저장돼요. 중요한 글은 <b>백업 저장</b>으로 파일로 보관해
                주세요.
              </span>
              <button onClick={() => setLocalHelp(true)}>
                사용 방법
                <CircleHelp size={13} />
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
                <div>
                  <div className="eyebrow">YOUR CONTENT, THOUGHTFULLY CRAFTED</div>
                  <h1>
                    {title}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {page === 'review'
                      ? '잠깐의 꼼꼼한 검토가 더 좋은 콘텐츠를 만들어요.'
                      : page === 'approved'
                        ? '직접 확인하고 승인한, 세상에 나갈 준비가 된 이야기들.'
                        : page === 'channels'
                          ? '하나의 이야기, 다양한 채널. 원고부터 차근차근 준비해요.'
                          : page === 'guide'
                            ? '처음이어도 괜찮아요. 한 단계씩 함께 시작해요.'
                            : '흩어진 아이디어를 모아, 발행할 준비까지 한곳에서.'}
                  </p>
                </div>
                {!['channels', 'guide'].includes(page) && (
                  <button className="button primary" onClick={() => navigate(page, 'new')}>
                    <Plus size={18} />새 콘텐츠 작성
                  </button>
                )}
              </div>
              {page === 'channels' ? (
                <ChannelsPage />
              ) : page === 'guide' ? (
                <Guide onCreate={() => navigate('all', 'new')} />
              ) : (
                <>
                  <div className="stats-grid">
                    {[
                      {
                        key: 'all',
                        label: '전체 콘텐츠',
                        count: contents.length,
                        icon: FileText,
                        note: '차곡차곡 쌓이는 이야기',
                        tone: 'gray',
                      },
                      {
                        key: 'draft',
                        label: '작성 중',
                        count: counts.draft,
                        icon: BookOpen,
                        note: '아이디어를 다듬는 중',
                        tone: 'blue',
                      },
                      {
                        key: 'review',
                        label: '검토 대기',
                        count: counts.review,
                        icon: Clock3,
                        note: '나의 확인을 기다려요',
                        tone: 'amber',
                      },
                      {
                        key: 'approved',
                        label: '승인 완료',
                        count: counts.approved,
                        icon: CheckCheck,
                        note: '발행할 준비가 됐어요',
                        tone: 'green',
                      },
                    ].map(({ key, label, count, icon: Icon, note, tone }) => (
                      <button
                        key={key}
                        className={`stat-card ${tone}`}
                        onClick={() => {
                          setPage('all');
                          setStatus(key as Status | 'all');
                          setSearch('');
                        }}
                      >
                        <span className="stat-title">
                          {label}
                          <span className="stat-icon">
                            <Icon size={18} />
                          </span>
                        </span>
                        <div className="stat-count">
                          {count}
                          <span>개</span>
                        </div>
                        <span className="stat-note">
                          {note}
                          <ArrowUpRight size={13} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <section className="flow-banner">
                    <span className="flow-banner-icon">
                      <Sparkles size={21} />
                    </span>
                    <div className="flow-banner-copy">
                      <b>좋은 콘텐츠는, 한 번 더 살펴보는 데서 시작해요.</b>
                      <span>내가 승인한 콘텐츠만 발행 준비 단계로 넘어가요.</span>
                    </div>
                    <StepFlow />
                  </section>
                  <section className="library" aria-label="콘텐츠 목록">
                    <div className="library-top">
                      <div className="status-tabs" role="group" aria-label="콘텐츠 상태 필터">
                        <button
                          className={status === 'all' ? 'active' : ''}
                          onClick={() => setStatus('all')}
                        >
                          전체 <span>{base.length}</span>
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
                          placeholder="제목이나 내용으로 검색해 보세요"
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
                        <span>
                          <Sparkles size={13} />
                          예시 콘텐츠로 사용 흐름을 살펴보세요. 직접 작성한 글과 구분되어 있어요.
                        </span>
                        <button onClick={() => setRemoveExamples(true)}>
                          예시 정리
                          <X size={12} />
                        </button>
                      </div>
                    )}
                    {loading ? (
                      <div className="empty-state">
                        <Loader2 className="spin" size={26} />
                        <h2>콘텐츠를 불러오고 있어요</h2>
                      </div>
                    ) : error ? (
                      <div className="empty-state">
                        <Unplug size={30} />
                        <h2>{LOCAL_MODE ? '저장한 글을 열지 못했어요' : '잠시 연결이 끊겼어요'}</h2>
                        <p>{error}</p>
                        <button className="button" onClick={() => void load()}>
                          다시 불러오기
                        </button>
                      </div>
                    ) : !contents.length ? (
                      <div className="empty-state first-use">
                        <div className="empty-art">
                          <FileText size={32} />
                          <span>
                            <Plus size={17} />
                          </span>
                        </div>
                        <span className="eyebrow">EVERY STORY STARTS SOMEWHERE</span>
                        <h2>첫 번째 이야기를 모아볼까요?</h2>
                        <p>
                          아이디어를 적고, 직접 검토하고, 최종 승인까지.
                          <br />
                          나만의 속도로 콘텐츠를 준비해 보세요.
                        </p>
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
                        <span className="empty-footnote">
                          <ShieldCheck size={13} />
                          승인 전에는 어디에도 발행되지 않아요
                        </span>
                      </div>
                    ) : !filtered.length ? (
                      <div className="empty-state">
                        <Search size={30} />
                        <h2>조건에 맞는 콘텐츠가 없어요</h2>
                        <p>다른 검색어나 필터로 다시 찾아보세요.</p>
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
                              <p>
                                {content.excerpt ||
                                  content.body ||
                                  '아직 본문이 없어요. 아이디어를 이어 적어보세요.'}
                              </p>
                              <ChannelBadges channels={content.channels} />
                              <div className="card-footer">
                                <span>
                                  <span className="tiny-avatar">나</span>나의 콘텐츠
                                </span>
                                <span>{formatDate(content.updatedAt)} 수정</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {!loading && !error && !!contents.length && (
                      <div className="library-footer">
                        <span>총 {filtered.length}개의 콘텐츠</span>
                        <span>
                          <ShieldCheck size={13} />
                          승인한 원고만 발행 준비 완료
                        </span>
                      </div>
                    )}
                  </section>
                </>
              )}
              <footer className="page-footer">
                <span>한 편 한 편, 나다운 이야기를 모으는 곳.</span>
                <Brand small />
              </footer>
            </div>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={15} />
          </span>
          {toast}
          <button aria-label="알림 닫기" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {localHelp && (
        <Modal title="내 컴퓨터에서 사용하는 방법" onClose={() => setLocalHelp(false)}>
          <div className="local-help">
            <p>인터넷 연결이나 서버 실행 없이 이 파일만 열면 돼요.</p>
            <ol>
              <li>같은 컴퓨터에서 같은 브라우저로 열어 주세요. Chrome 또는 Edge를 권장해요.</li>
              <li>
                화면 위 <b>백업 저장</b>을 누르면 작성 중인 글과 검토 기록 전체를 파일로 보관할 수
                있어요.
              </li>
              <li>
                다른 컴퓨터·브라우저로 옮기거나 HTML 파일의 위치를 바꾸기 전에는 먼저 백업해 주세요.
                옮긴 뒤 <b>백업 가져오기</b>로 복원해요.
              </li>
              <li>
                기존 원고와 다른 백업 원고는 별도의 복원본으로 추가돼요. 현재 작성한 원고를 덮어쓰지
                않아요.
              </li>
              <li>
                브라우저 데이터 삭제 시 원고도 삭제돼요. 시크릿·InPrivate 창은 사용하지 마세요.
              </li>
            </ol>
            <p>
              다른 사람이 이 컴퓨터의 같은 브라우저를 사용하면 원고를 볼 수 있어요. 컴퓨터 사용자
              계정을 구분해서 사용해 주세요.
            </p>
          </div>
          <div className="modal-actions">
            <button className="button primary" onClick={() => setLocalHelp(false)}>
              알겠어요
            </button>
          </div>
        </Modal>
      )}
      {removeExamples && (
        <Modal title="예시 콘텐츠를 정리할까요?" onClose={() => setRemoveExamples(false)}>
          <p className="modal-description">
            ‘예시’ 표시가 있는 콘텐츠만 삭제해요. 직접 작성한 글은 그대로 보관돼요.
          </p>
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
    <>
      <div className="info-banner">
        <ShieldCheck size={23} />
        <div>
          <b>지금은 콘텐츠를 준비하고 검토하는 단계예요.</b>
          <p>승인한 글은 보관되며, 업로드 연결을 추가한 뒤 채널에 발행할 수 있어요.</p>
        </div>
      </div>
      <div className="channels-grid">
        {(Object.keys(CHANNEL_NAMES) as Channel[]).map((channel) => (
          <article className="channel-card" key={channel}>
            <span className={`channel-logo ${channel}`}>
              <ChannelIcon channel={channel} size={27} />
            </span>
            <span className="connection-badge">
              <i />
              미연결
            </span>
            <h2>{CHANNEL_NAMES[channel]}</h2>
            <p>
              {channel === 'website'
                ? '긴 호흡의 이야기와 브랜드 소식을 웹사이트에 전해요.'
                : channel === 'instagram'
                  ? '사진과 함께할 캡션을 미리 다듬고 검토해요.'
                  : '짧고 가벼운 생각을 대화처럼 나눌 수 있어요.'}
            </p>
            <div className="channel-capabilities">
              <span>
                <Check size={14} />
                원고 작성·미리보기
              </span>
              <span>
                <Check size={14} />
                검토·최종 승인
              </span>
              <span className="muted">
                <Clock3 size={14} />
                업로드 연결 예정
              </span>
            </div>
            <button className="button" disabled>
              <Unplug size={15} />
              업로드 연결은 추후 제공
            </button>
          </article>
        ))}
      </div>
      <div className="channel-bottom-note">
        <BookOpen size={18} />
        <p>
          같은 콘텐츠라도 채널에 맞는 원고를 따로 작성할 수 있어요.
          <br />
          콘텐츠 편집 화면의 <b>채널별 원고</b>에서 준비해 보세요.
        </p>
      </div>
    </>
  );
}
function Guide({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="guide">
      <div className="guide-intro">
        <span className="guide-icon">
          <Sparkles size={26} />
        </span>
        <h2>좋은 이야기를 세상에 전하기까지</h2>
        <p>작성부터 검토까지, 이 네 단계만 기억해 주세요.</p>
        <StepFlow />
      </div>
      <div className="guide-steps">
        {[
          {
            title: '아이디어를 글로 적어요',
            body: '‘새 콘텐츠 작성’을 누르고 제목과 본문을 작성해요. 웹사이트와 SNS 중 나중에 올릴 채널을 고르고, 채널별 원고도 따로 준비할 수 있어요.',
          },
          {
            title: '직접 살펴보고 의견을 남겨요',
            body: '‘검토 요청’을 누르면 나의 검토함에 들어가요. 미리보기로 글을 읽고, 바꿀 부분이 있으면 의견과 함께 ‘수정 요청’을 눌러요.',
          },
          {
            title: '괜찮다면 최종 승인해요',
            body: '내용·권리·채널별 표현을 확인한 뒤 ‘최종 승인’을 눌러요. 승인한 글을 나중에 고치면 다시 검토를 받아야 해요.',
          },
          {
            title: '연결이 준비되면 발행해요',
            body: '현재는 실제 업로드를 하지 않아요. 승인된 원고는 안전하게 보관되며 내보낼 수 있어요. 웹사이트·SNS 연결은 다음 단계에서 추가해요.',
          },
        ].map((step, index) => (
          <article key={step.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </article>
        ))}
      </div>
      <button className="button primary" onClick={onCreate}>
        첫 이야기 시작하기
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
