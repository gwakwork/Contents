import express from 'express';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
import {
  AppError,
  createContent,
  updateContent,
  transition,
  publicationEnvelope,
} from './domain.mjs';
import { createStore, seedExamples } from './store.mjs';
import { createAISettings } from './ai-settings.mjs';
import { installAIRoutes } from './ai-routes.mjs';
import { createBackup } from './backup.mjs';
import { installPlanningRoutes } from './planning-routes.mjs';

export function createApplication({
  dbPath = resolve('data/studio.sqlite'),
  seed = false,
  settingsFile = resolve(dirname(dbPath), 'ai-settings.json'),
  environmentKey = process.env.MOA_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
  environmentModel = process.env.MOA_OPENAI_MODEL || '',
  aiFetch,
} = {}) {
  const store = createStore(dbPath);
  if (seed && !store.setting('initialized')) {
    seedExamples(store);
    store.setSetting('initialized', '1');
  }
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    if (req.path.startsWith('/api/')) {
      let host;
      try {
        host = new URL(`http://${req.get('host')}`).hostname;
      } catch {
        return res.status(403).json({ error: '이 컴퓨터의 작업 공간에서 열어 주세요.' });
      }
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host))
        return res.status(403).json({ error: '이 컴퓨터의 작업 공간에서 열어 주세요.' });
    }
    // Reject cross-site mutations. This workspace application deliberately has no public CORS API.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      let foreignOrigin = false;
      if (origin) {
        try {
          foreignOrigin = new URL(origin).host !== req.get('host');
        } catch {
          foreignOrigin = true;
        }
      }
      if (req.get('sec-fetch-site') === 'cross-site' || foreignOrigin) {
        return res.status(403).json({ error: '이 작업 공간에서 다시 시도해 주세요.' });
      }
      if (!req.is('application/json'))
        return res.status(415).json({ error: 'JSON 형식으로 요청해 주세요.' });
    }
    next();
  });
  app.use('/api/backup', express.json({ limit: '25mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', (req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    ) {
      return res.status(400).json({ error: '요청 형식이 올바르지 않아요.' });
    }
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      storage: 'sqlite',
      application: 'moa-content-studio',
      ai: true,
      version,
      name: 'Narrative',
    }),
  );
  const ai = installAIRoutes(app, {
    store,
    settings: createAISettings({ file: settingsFile, environmentKey, environmentModel }),
    fetchImpl: aiFetch,
  });
  installPlanningRoutes(app, { store });
  app.get('/api/channels', (_req, res) =>
    res.json([
      { id: 'website', name: '웹사이트', connected: false },
      { id: 'instagram', name: '인스타그램', connected: false },
      { id: 'threads', name: 'Threads', connected: false },
    ]),
  );
  app.get('/api/contents', (_req, res) => res.json(store.list()));
  app.get('/api/backup', (_req, res) => res.json(createBackup(store.list(), store.listPlans())));
  app.post('/api/backup', (req, res) => res.json(store.restoreBackup(req.body)));
  app.post('/api/contents', (req, res) =>
    res.status(201).json(store.insert(createContent(req.body))),
  );
  app.get('/api/contents/:id', (req, res) => res.json(store.get(req.params.id)));
  app.put('/api/contents/:id', (req, res) =>
    res.json(
      store.mutate(req.params.id, req.body.revision, (content) => updateContent(content, req.body)),
    ),
  );
  app.post('/api/contents/:id/actions', (req, res) =>
    res.json(
      store.mutate(req.params.id, req.body.revision, (content) => transition(content, req.body)),
    ),
  );
  app.delete('/api/contents/:id', (req, res) => {
    store.remove(req.params.id, req.body.revision);
    res.status(204).end();
  });
  app.get('/api/contents/:id/export', (req, res) => {
    const envelope = publicationEnvelope(store.get(req.params.id));
    res
      .set('Content-Disposition', `attachment; filename="content-${envelope.contentId}.json"`)
      .json(envelope);
  });
  app.post('/api/contents/:id/publish', (req, _res) => {
    publicationEnvelope(store.get(req.params.id));
    throw new AppError(
      '아직 연결된 발행 채널이 없어요. 승인된 원고는 안전하게 보관되어 있어요.',
      409,
    );
  });
  app.post('/api/examples', (_req, res) => {
    seedExamples(store);
    store.setSetting('initialized', '1');
    res.status(201).json(store.list());
  });
  app.delete('/api/examples', (_req, res) => {
    const removed = store.removeExamples();
    store.setSetting('initialized', '1');
    res.json({ removed });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '요청한 기능을 찾을 수 없어요.' }));
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    const status = error.status ?? 500;
    if (status >= 500 && !(error instanceof AppError))
      console.error('Internal request failure:', error.name);
    res.status(status).json({
      error:
        status >= 500 && !(error instanceof AppError)
          ? '저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
          : error.type === 'entity.parse.failed'
            ? '요청 형식이 올바르지 않아요.'
            : error.message,
    });
  });
  return {
    app,
    store,
    close: async () => {
      await ai.close();
      store.close();
    },
  };
}
