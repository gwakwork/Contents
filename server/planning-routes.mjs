import { createPlan, updatePlan, completePlan } from './planning.mjs';

export function installPlanningRoutes(app, { store }) {
  app.get('/api/plans', (_req, res) => res.json(store.listPlans()));
  app.post('/api/plans', (req, res) =>
    res.status(201).json(store.insertPlan(createPlan(req.body))),
  );
  app.get('/api/plans/:id', (req, res) => res.json(store.getPlan(req.params.id)));
  app.put('/api/plans/:id', (req, res) =>
    res.json(
      store.mutatePlan(req.params.id, req.body.revision, (plan) => updatePlan(plan, req.body)),
    ),
  );
  app.post('/api/plans/:id/complete', (req, res) =>
    res.json(store.mutatePlan(req.params.id, req.body.revision, completePlan)),
  );
  app.delete('/api/plans/:id', (req, res) => {
    store.removePlan(req.params.id, req.body.revision);
    res.status(204).end();
  });
}
