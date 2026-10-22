import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppError, addEvent, createContent, transition } from './domain.mjs';
import { createExampleContents } from './examples.mjs';
import { mergeBackup, validateBackup } from './backup.mjs';

export function createStore(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS contents (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_generations (id TEXT PRIMARY KEY, data TEXT NOT NULL);`);
  function generation(id) {
    const row = db.prepare('SELECT data FROM ai_generations WHERE id = ?').get(id);
    return row ? JSON.parse(row.data) : null;
  }
  function saveGeneration(value) {
    db.prepare(
      'INSERT INTO ai_generations (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
    ).run(value.id, JSON.stringify(value));
    return value;
  }
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
    restoreBackup(value) {
      const incoming = validateBackup(value);
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = db
          .prepare('SELECT data FROM contents')
          .all()
          .map((row) => JSON.parse(row.data));
        const { additions, summary } = mergeBackup(existing, incoming);
        for (const content of additions) insert(content);
        db.exec('COMMIT');
        return summary;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
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
    generation,
    saveGeneration,
    generations: () =>
      db
        .prepare('SELECT data FROM ai_generations ORDER BY rowid DESC LIMIT 100')
        .all()
        .map((row) => JSON.parse(row.data)),
    interruptGenerations() {
      for (const row of db.prepare('SELECT data FROM ai_generations').all()) {
        const value = JSON.parse(row.data);
        if (value.status === 'running')
          saveGeneration({
            ...value,
            status: 'interrupted',
            error: '앱이 재시작되어 결과를 확인할 수 없어요. 자동으로 재요청하지 않았어요.',
            completedAt: new Date().toISOString(),
          });
      }
    },
    adoptGeneration(id) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const run = generation(id);
        if (!run || run.status !== 'completed')
          throw new AppError('완성된 AI 결과만 검토함으로 보낼 수 있어요.', 409);
        if (run.contentId) {
          const existing = get(run.contentId);
          db.exec('COMMIT');
          return existing;
        }
        const result = run.result;
        let content = createContent({
          title: result.title,
          excerpt: result.excerpt,
          body: result.body,
          color: 'sage',
          channels: run.input.channels,
          variants: { instagram: result.instagram, threads: result.threads },
        });
        content.aiSource = {
          generationId: run.id,
          source: run.input.source,
          formula: run.input.formula,
          instructions: [run.input.customFormula, run.input.instructions]
            .filter(Boolean)
            .join('\n'),
          model: run.model,
          createdAt: run.createdAt,
        };
        content = addEvent(
          content,
          'note',
          `AI 각색 · ${run.input.formula.toUpperCase()} · ${run.model}\n${result.reviewNotes.slice(0, 6).join('\n')}`.slice(
            0,
            3000,
          ),
        );
        content = { ...transition(content, { action: 'submit' }), revision: 2 };
        insert(content);
        saveGeneration({ ...run, contentId: content.id });
        db.exec('COMMIT');
        return content;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export function seedExamples(store) {
  if (store.list().some((c) => c.isExample)) throw new AppError('예시 콘텐츠가 이미 있어요.', 409);
  for (const content of createExampleContents()) store.insert(content);
}
