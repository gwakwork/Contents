import type { Channel } from '../src/types';
export interface PlanOption {
  value: string;
  label: string;
  description?: string;
}
export interface PlanFields {
  topic: string;
  purpose: string;
  metric: string;
  target: string;
  timeframe: string;
  audience: string;
  awareness: string;
  need: string;
  message: string;
  angle: string;
  evidence: string;
  objection: string;
  action: string;
  channels: Channel[];
  format: string;
  tone: string;
  formula: string;
  customFormula: string;
  length: string;
  trigger: string;
  nextStep: string;
  checks: { specific: boolean; audience: boolean; evidence: boolean; feasible: boolean };
}
export interface Plan {
  id: string;
  revision: number;
  status: 'draft' | 'ready';
  step: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  fields: PlanFields;
}
export interface PlanReadiness {
  steps: { id: string; label: string; complete: boolean; missing: string[] }[];
  complete: boolean;
  missing: string[];
  completedSteps: number;
  totalSteps: number;
  progress: number;
}
export interface PlanBrief {
  planId: string;
  planRevision: number;
  source: string;
  audience: string;
  instructions: string;
  formula: string;
  customFormula: string;
  tone: string;
  length: string;
  channels: Channel[];
}
export const PLAN_STEPS: { id: string; label: string }[];
export const PLAN_OPTIONS: Record<string, PlanOption[]>;
export const PLAN_METRICS: Record<string, PlanOption[]>;
export const PLAN_CHECKS: { id: keyof PlanFields['checks']; label: string }[];
export const EMPTY_PLAN_FIELDS: PlanFields;
export function validatePlanFields(input: unknown, previous?: PlanFields): PlanFields;
export function createPlan(input?: { step?: number; fields?: Partial<PlanFields> }): Plan;
export function updatePlan(
  plan: Plan,
  input: { step?: number; fields?: Partial<PlanFields> },
): Plan;
export function planReadiness(plan: Plan): PlanReadiness;
export function completePlan(plan: Plan): Plan;
export function planToBrief(plan: Plan): PlanBrief;
export function validateStoredPlan(value: unknown): Plan;
export function validatePlanBackup(backup: unknown): Plan[];
export function mergePlanBackup(
  existing: Plan[],
  incoming: Plan[],
): { additions: Plan[]; summary: { added: number; copies: number; skipped: number } };
