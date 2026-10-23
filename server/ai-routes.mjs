import { createHash } from 'node:crypto';
import { FORMULAS, generateAI, validateAIInput } from './ai.mjs';
import { AppError } from './domain.mjs';

export function installAIRoutes(app, { store, settings, fetchImpl }) {
  store.interruptGenerations();
  const active = new Map();
  app.get('/api/ai/settings', (_req, res) => res.json(settings.status()));
  app.put('/api/ai/settings', (req, res) => res.json(settings.save(req.body)));
  app.delete('/api/ai/settings', (_req, res) => res.json(settings.clear()));
  app.get('/api/ai/formulas', (_req, res) => res.json(FORMULAS));
  app.get('/api/ai/generations', (_req, res) => res.json(store.generations()));
  app.get('/api/ai/generations/:id', (req, res) => {
    const run = store.generation(req.params.id);
    if (!run) throw new AppError('AI 작업을 찾을 수 없어요.', 404);
    res.json(run);
  });
  app.post('/api/ai/generations', (req, res) => {
    const input = validateAIInput(req.body);
    const id = req.body.requestId;
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id))
      throw new AppError('작업 번호가 올바르지 않아요. 화면을 새로 열어 주세요.');
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const previous = store.generation(id);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new AppError('같은 작업 번호로 다른 원문을 보낼 수 없어요.', 409);
      return res.status(previous.status === 'running' ? 202 : 200).json(previous);
    }
    if (active.size)
      throw new AppError('이미 AI가 작업하고 있어요. 기존 작업을 확인하거나 취소해 주세요.', 409);
    if (input.planId) {
      let plan;
      try {
        plan = store.getPlan(input.planId);
      } catch {
        throw new AppError('연결된 기획을 찾을 수 없어요. 기획에서 다시 시작해 주세요.', 409);
      }
      if (plan.status !== 'ready' || plan.revision !== input.planRevision)
        throw new AppError(
          '기획이 변경되었어요. 기획을 완료한 뒤 AI 작업실로 다시 보내 주세요.',
          409,
        );
      input.planning = structuredClone(plan);
    }
    const { apiKey, model } = settings.credentials();
    if (!apiKey) throw new AppError('먼저 AI 연결 설정에서 OpenAI API 키를 입력해 주세요.', 409);
    const run = store.saveGeneration({
      id,
      fingerprint,
      input,
      model,
      status: 'running',
      createdAt: new Date().toISOString(),
      completedAt: null,
      contentId: null,
      result: null,
      error: null,
    });
    const controller = new AbortController();
    const promise = Promise.resolve().then(async () => {
      try {
        const generated = await generateAI({
          input,
          apiKey,
          model,
          signal: controller.signal,
          fetchImpl,
        });
        if (store.generation(id)?.status === 'running')
          store.saveGeneration({
            ...run,
            ...generated,
            status: 'completed',
            completedAt: new Date().toISOString(),
          });
      } catch (error) {
        if (store.generation(id)?.status === 'running')
          store.saveGeneration({
            ...run,
            status: controller.signal.aborted ? 'cancelled' : 'failed',
            error:
              error instanceof AppError
                ? error.message
                : 'AI 결과를 처리하지 못했어요. 자동으로 재요청하지 않았어요.',
            completedAt: new Date().toISOString(),
          });
      } finally {
        active.delete(id);
      }
    });
    active.set(id, { controller, promise });
    res.status(202).json(run);
  });
  app.post('/api/ai/generations/:id/cancel', (req, res) => {
    const run = store.generation(req.params.id);
    if (!run) throw new AppError('AI 작업을 찾을 수 없어요.', 404);
    if (run.status !== 'running') throw new AppError('진행 중인 작업만 취소할 수 있어요.', 409);
    active.get(run.id)?.controller.abort();
    res.json(
      store.saveGeneration({
        ...run,
        status: 'cancelled',
        completedAt: new Date().toISOString(),
        error: 'AI 작업을 취소했어요. 이미 처리된 API 사용량은 청구될 수 있어요.',
      }),
    );
  });
  app.post('/api/ai/generations/:id/adopt', (req, res) =>
    res.json(store.adoptGeneration(req.params.id)),
  );
  return {
    close: async () => {
      for (const task of active.values()) task.controller.abort();
      await Promise.allSettled([...active.values()].map((task) => task.promise));
    },
  };
}
