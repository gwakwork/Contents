import {
  AppError,
  createContent,
  publicationEnvelope,
  transition,
  updateContent,
} from '../server/domain.mjs';
import { createExampleContents } from '../server/examples.mjs';
import {
  createBackup,
  mergeBackup,
  validateBackup,
  type BackupSummary,
} from '../server/backup.mjs';
import {
  createPlan,
  updatePlan,
  completePlan,
  mergePlanBackup,
  validatePlanBackup,
  type Plan,
} from '../server/planning.mjs';
import { CHANNEL_NAMES, type Content } from './types';

export const LOCAL_MODE = import.meta.env.MODE === 'offline';
const DATABASE_NAME = 'moa-content-studio-local-v1';
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 2);
      let failed = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('contents'))
          request.result.createObjectStore('contents', { keyPath: 'id' });
        if (!request.result.objectStoreNames.contains('plans'))
          request.result.createObjectStore('plans', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        if (failed) {
          db.close();
          database = undefined;
          return;
        }
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
        failed = true;
        database = undefined;
        reject(new AppError('다른 Narrative 창을 닫고 다시 열어 주세요.'));
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
  storeNames: string[] = ['contents'],
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
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
        tx.objectStore(storeNames[0]),
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
function listPlans() {
  return transaction<Plan[]>(
    'readonly',
    (store, done) => {
      const request = store.getAll();
      request.onsuccess = () =>
        done(request.result.sort((a: Plan, b: Plan) => b.updatedAt.localeCompare(a.updatedAt)));
    },
    ['plans'],
  );
}
function mutatePlan(id: string, revision: unknown, operation: (plan: Plan) => Plan | null) {
  return transaction<Plan | undefined>(
    'readwrite',
    (store, done, fail) => {
      const request = store.get(id);
      request.onsuccess = () => {
        try {
          const current = request.result as Plan | undefined;
          if (!current) throw new AppError('기획을 찾을 수 없어요.', 404);
          if (!Number.isSafeInteger(revision) || Number(revision) < 1)
            throw new AppError('기획 버전이 올바르지 않아요.');
          if (revision !== current.revision)
            throw new AppError(
              '다른 창에서 변경된 기획이 있어요. 다시 불러온 뒤 확인해 주세요.',
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
          if (current.revision >= Number.MAX_SAFE_INTEGER)
            throw new AppError(
              '기획 버전의 범위를 초과했어요. 백업에서 별도 복원본을 만들어 주세요.',
              409,
            );
          const next = { ...result, revision: current.revision + 1 };
          store.put(next);
          done(next);
        } catch (error) {
          fail(error as Error);
        }
      };
    },
    ['plans'],
  );
}
export async function localApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? 'GET';
  const payload = options.body ? JSON.parse(String(options.body)) : {};
  let result: unknown;
  if (
    !['GET', 'HEAD'].includes(method) &&
    (!payload || typeof payload !== 'object' || Array.isArray(payload))
  )
    throw new AppError('요청 형식이 올바르지 않아요.');
  if (path === '/plans' && method === 'GET') result = await listPlans();
  else if (path === '/plans' && method === 'POST') {
    const plan = createPlan(payload);
    result = await transaction<Plan>(
      'readwrite',
      (store, done) => {
        store.add(plan);
        done(plan);
      },
      ['plans'],
    );
  } else if (path.startsWith('/plans/')) {
    const match = path.match(/^\/plans\/([a-f0-9-]+)(?:\/(complete))?$/);
    if (!match) throw new AppError('기획 기능을 찾을 수 없어요.', 404);
    const [, id, action] = match;
    if (method === 'PUT' && !action)
      result = await mutatePlan(id, payload.revision, (plan) => updatePlan(plan, payload));
    else if (method === 'DELETE' && !action)
      result = await mutatePlan(id, payload.revision, () => null);
    else if (method === 'POST' && action === 'complete')
      result = await mutatePlan(id, payload.revision, completePlan);
    else if (method === 'GET' && !action)
      result = await transaction<Plan>(
        'readonly',
        (store, done, fail) => {
          const request = store.get(id);
          request.onsuccess = () => {
            if (!request.result) fail(new AppError('기획을 찾을 수 없어요.', 404));
            else done(request.result);
          };
        },
        ['plans'],
      );
    else throw new AppError('지원하지 않는 기획 작업이에요.');
  } else if (path === '/contents' && method === 'GET') result = await list();
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
  return transaction<ReturnType<typeof createBackup>>(
    'readonly',
    (store, done) => {
      const contentRequest = store.getAll();
      contentRequest.onsuccess = () => {
        const planRequest = store.transaction.objectStore('plans').getAll();
        planRequest.onsuccess = () =>
          done(createBackup(ordered(contentRequest.result), planRequest.result));
      };
    },
    ['contents', 'plans'],
  );
}
export async function restoreLocalBackup(value: unknown) {
  const incoming = validateBackup(value);
  const incomingPlans = validatePlanBackup(value);
  return transaction<BackupSummary>(
    'readwrite',
    (store, done, fail) => {
      const contentRequest = store.getAll();
      contentRequest.onsuccess = () => {
        const planStore = store.transaction.objectStore('plans');
        const planRequest = planStore.getAll();
        planRequest.onsuccess = () => {
          try {
            const { additions, summary } = mergeBackup(
              contentRequest.result as Content[],
              incoming,
            );
            const planMerge = mergePlanBackup(planRequest.result as Plan[], incomingPlans);
            for (const content of additions) store.add(content);
            for (const plan of planMerge.additions) planStore.add(plan);
            done({ ...summary, plans: planMerge.summary });
          } catch (error) {
            fail(error as Error);
          }
        };
      };
    },
    ['contents', 'plans'],
  );
}
