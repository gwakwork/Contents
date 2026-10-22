import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppError } from './domain.mjs';
import { createExampleContents } from './examples.mjs';

export function createStore(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS contents (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  function insert(content) {
    db.prepare('INSERT INTO contents (id, revision, data) VALUES (?, ?, ?)').run(
      content.id,
      content.revision,
      JSON.stringify(content),
    );
    return content;
  }
  function get(id) {
    const row = db.prepare('SELECT data FROM contents WHERE id = ?').get(id);
    if (!row) throw new AppError('콘텐츠를 찾을 수 없어요.', 404);
    return JSON.parse(row.data);
  }
  function mutate(id, revision, fn) {
    if (!Number.isInteger(revision) || revision < 1)
      throw new AppError('콘텐츠 버전이 올바르지 않아요.');
    const current = get(id);
    if (revision !== current.revision)
      throw new AppError(
        '다른 화면에서 변경된 내용이 있어요. 새로고침 후 다시 시도해 주세요.',
        409,
      );
    const result = fn(current);
    if (result === current) return current;
    const next = { ...result, revision: current.revision + 1 };
    const outcome = db
      .prepare('UPDATE contents SET data = ?, revision = ? WHERE id = ? AND revision = ?')
      .run(JSON.stringify(next), next.revision, id, revision);
    if (outcome.changes !== 1)
      throw new AppError('변경된 내용이 있어요. 새로고침 후 다시 시도해 주세요.', 409);
    return next;
  }
  return {
    insert,
    get,
    mutate,
    list: () =>
      db
        .prepare('SELECT data FROM contents')
        .all()
        .map((r) => JSON.parse(r.data))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    remove(id, revision) {
      get(id);
      if (
        db.prepare('DELETE FROM contents WHERE id = ? AND revision = ?').run(id, revision)
          .changes !== 1
      )
        throw new AppError('변경된 내용이 있어요. 새로고침 후 다시 시도해 주세요.', 409);
    },
    removeExamples() {
      return db.prepare("DELETE FROM contents WHERE json_extract(data, '$.isExample') = 1").run()
        .changes;
    },
    setting: (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value,
    setSetting: (key, value) =>
      db
        .prepare(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        )
        .run(key, value),
    close: () => db.close(),
  };
}

export function seedExamples(store) {
  if (store.list().some((c) => c.isExample)) throw new AppError('예시 콘텐츠가 이미 있어요.', 409);
  for (const content of createExampleContents()) store.insert(content);
}
