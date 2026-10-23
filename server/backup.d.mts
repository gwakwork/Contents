import type { Content } from '../src/types';
import type { Plan } from './planning.mjs';
export interface BackupSummary {
  added: number;
  copies: number;
  skipped: number;
  plans: { added: number; copies: number; skipped: number };
}
export function createBackup(
  contents: Content[],
  plans?: Plan[],
): {
  format: string;
  version: number;
  exportedAt: string;
  contents: Content[];
  plans: Plan[];
};
export function validateBackup(value: unknown): Content[];
export function mergeBackup(
  existing: Content[],
  incoming: Content[],
): { additions: Content[]; summary: { added: number; copies: number; skipped: number } };
