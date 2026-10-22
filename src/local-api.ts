import {
  AppError,
  addEvent,
  createContent,
  publicationEnvelope,
  transition,
  updateContent,
  validateFields,
} from '../server/domain.mjs';
import { createExampleContents } from '../server/examples.mjs';
import { CHANNEL_NAMES, type Content } from './types';

export const LOCAL_MODE = import.meta.env.MODE === 'offline';
const DATABASE_NAME = 'moa-content-studio-local-v1';
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('contents', { keyPath: 'id' });
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
      request.onerror = () => {
        database = undefined;
        reject(
          new AppError(
            '브라우저 저장 공간을 열지 못했어요. Chrome 또는 Edge의 일반 창에서 다시 열어 주세요.',
          ),
        );
      };
      request.onblocked = () => {
        database = undefined;
        reject(new AppError('다른 모아 창을 닫고 다시 열어 주세요.'));
      };
    });
  return database;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    done: (value: T) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('contents', mode);
    let result: T;
    let failure: Error | undefined;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        failure ||
          new AppError(
            tx.error?.name === 'QuotaExceededError'
              ? '브라우저 저장 공간이 부족해요. 먼저 백업을 내려받고 저장 공간을 정리해 주세요.'
              : '저장하지 못했어요. 브라우저의 저장 권한과 디스크 공간을 확인해 주세요.',
          ),
      );
    tx.onerror = () => {
      /* onabort handles the failure without hiding the original error. */
    };
    const fail = (error: Error) => {
      failure = error;
      tx.abort();
    };
    try {
      operation(
        tx.objectStore('contents'),
        (value) => {
          result = value;
        },
        fail,
      );
    } catch (error) {
      fail(error as Error);
    }
  });
}
function ordered(contents: Content[]) {
  return contents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function list() {
  return transaction<Content[]>('readonly', (store, done) => {
    const request = store.getAll();
    request.onsuccess = () => done(ordered(request.result));
  });
}
function mutate(id: string, revision: unknown, operation: (content: Content) => Content | null) {
  return transaction<Content | undefined>('readwrite', (store, done, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        const current = request.result as Content | undefined;
        if (!current) throw new AppError('콘텐츠를 찾을 수 없어요.', 404);
        if (!Number.isInteger(revision) || revision !== current.revision)
          throw new AppError(
            '다른 창에서 변경된 내용이 있어요. 새로고침 후 다시 시도해 주세요.',
            409,
          );
        const result = operation(current);
        if (!result) {
          store.delete(id);
          done(undefined);
          return;
        }
        if (result === current) {
          done(current);
          return;
        }
        const next = { ...result, revision: current.revision + 1 };
        store.put(next);
        done(next);
      } catch (error) {
        fail(error as Error);
      }
    };
  });
}
export async function localApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? 'GET';
  const payload = options.body ? JSON.parse(String(options.body)) : {};
  let result: unknown;
  if (path === '/contents' && method === 'GET') result = await list();
  else if (path === '/contents' && method === 'POST') {
    const content = createContent(payload);
    result = await transaction<Content>('readwrite', (store, done) => {
      store.add(content);
      done(content);
    });
  } else if (path === '/channels')
    result = Object.entries(CHANNEL_NAMES).map(([id, name]) => ({ id, name, connected: false }));
  else if (path === '/examples') {
    result = await transaction('readwrite', (store, done, fail) => {
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const current = request.result as Content[];
          if (method === 'POST') {
            if (current.some((c) => c.isExample)) throw new AppError('예시 콘텐츠가 이미 있어요.');
            const examples = createExampleContents();
            for (const content of examples) store.add(content);
            done(ordered([...current, ...examples]));
          } else if (method === 'DELETE') {
            const examples = current.filter((c) => c.isExample);
            for (const content of examples) store.delete(content.id);
            done({ removed: examples.length });
          } else throw new AppError('지원하지 않는 작업이에요.');
        } catch (error) {
          fail(error as Error);
        }
      };
    });
  } else {
    const match = path.match(/^\/contents\/([a-f0-9-]+)(?:\/(actions|export|publish))?$/);
    if (!match) throw new AppError('요청한 기능을 찾을 수 없어요.');
    const [, id, action] = match;
    if (method === 'PUT' && !action)
      result = await mutate(id, payload.revision, (content) => updateContent(content, payload));
    else if (method === 'DELETE' && !action)
      result = await mutate(id, payload.revision, () => null);
    else if (method === 'POST' && action === 'actions')
      result = await mutate(id, payload.revision, (content) => transition(content, payload));
    else if (method === 'GET' && (!action || action === 'export')) {
      result = await transaction('readonly', (store, done, fail) => {
        const request = store.get(id);
        request.onsuccess = () => {
          try {
            if (!request.result) throw new AppError('콘텐츠를 찾을 수 없어요.');
            done(action === 'export' ? publicationEnvelope(request.result) : request.result);
          } catch (error) {
            fail(error as Error);
          }
        };
      });
    } else if (action === 'publish')
      throw new AppError(
        '실제 업로드는 아직 연결하지 않았어요. 승인된 원고는 이 컴퓨터에 보관돼요.',
      );
    else throw new AppError('지원하지 않는 작업이에요.');
  }
  return result as T;
}

export async function createLocalBackup() {
  return {
    format: 'moa-content-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    contents: await list(),
  };
}
function validateBackup(value: unknown): Content[] {
  if (!value || typeof value !== 'object')
    throw new AppError('모아에서 내려받은 백업 파일을 선택해 주세요.');
  const backup = value as Record<string, unknown>;
  if (
    backup.format !== 'moa-content-backup' ||
    backup.version !== 1 ||
    !Array.isArray(backup.contents) ||
    backup.contents.length > 10000
  )
    throw new AppError('지원하지 않는 백업 파일이에요. 원본 백업 파일을 확인해 주세요.');
  const ids = new Set<string>();
  const date = (s: unknown) => typeof s === 'string' && Number.isFinite(Date.parse(s));
  return backup.contents.map((value: unknown) => {
    const c = value as Content;
    if (
      !c ||
      typeof c !== 'object' ||
      typeof c.id !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(c.id) ||
      ids.has(c.id) ||
      !Number.isInteger(c.revision) ||
      c.revision < 1 ||
      !['draft', 'review', 'changes', 'approved'].includes(c.status) ||
      typeof c.isExample !== 'boolean' ||
      !date(c.createdAt) ||
      !date(c.updatedAt) ||
      !Array.isArray(c.history) ||
      c.history.length > 10000 ||
      c.history.some(
        (event) =>
          !event ||
          typeof event.id !== 'string' ||
          !['created', 'edited', 'submitted', 'approved', 'changes_requested', 'note'].includes(
            event.action,
          ) ||
          typeof event.message !== 'string' ||
          event.message.length > 3000 ||
          !date(event.at),
      )
    )
      throw new AppError('백업의 콘텐츠 정보가 올바르지 않아요. 원본 파일을 확인해 주세요.');
    const fields = validateFields(c);
    if (c.status === 'approved') {
      if (
        !c.approval ||
        !date(c.approvedAt) ||
        c.approval.at !== c.approvedAt ||
        !Number.isInteger(c.approval.revision) ||
        c.approval.revision < 1 ||
        c.approval.revision > c.revision ||
        !['accuracy', 'rights', 'channels'].every((key) => c.approval!.checks?.[key] === true)
      )
        throw new AppError('백업의 승인 기록이 올바르지 않아요.');
    } else if (c.approval !== null || c.approvedAt !== null)
      throw new AppError('백업의 검토 상태가 올바르지 않아요.');
    ids.add(c.id);
    return {
      ...fields,
      id: c.id,
      revision: c.revision,
      status: c.status,
      isExample: c.isExample,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      approvedAt: c.approvedAt,
      approval: c.approval,
      history: c.history,
    };
  });
}
export async function restoreLocalBackup(value: unknown) {
  const incoming = validateBackup(value);
  return transaction<{ added: number; copies: number; skipped: number }>(
    'readwrite',
    (store, done, fail) => {
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const existing = new Map<string, Content>(
            (request.result as Content[]).map((c) => [c.id, c]),
          );
          const summary = { added: 0, copies: 0, skipped: 0 };
          for (const content of incoming) {
            const current = existing.get(content.id);
            if (
              current &&
              JSON.stringify(canonical(current)) === JSON.stringify(canonical(content))
            ) {
              summary.skipped++;
              continue;
            }
            if (current) {
              const copy: Content = {
                ...content,
                id: crypto.randomUUID(),
                title: content.title.slice(0, 150) + ' (복원본)',
                status: 'draft',
                revision: content.revision + 1,
                approval: null,
                approvedAt: null,
              };
              store.add(
                addEvent(
                  copy,
                  'edited',
                  '현재 원고를 보존하고 백업을 별도 복원본으로 가져왔어요. 기존 검토 이력은 보관하며 복원본은 다시 검토해 주세요.',
                ),
              );
              summary.copies++;
            } else {
              store.add(content);
              summary.added++;
            }
          }
          done(summary);
        } catch (error) {
          fail(error as Error);
        }
      };
    },
  );
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
