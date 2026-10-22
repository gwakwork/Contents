import type { Content } from '../src/types';
export function createBackup(contents: Content[]): {
  format: string;
  version: number;
  exportedAt: string;
  contents: Content[];
};
export function validateBackup(value: unknown): Content[];
export function mergeBackup(
  existing: Content[],
  incoming: Content[],
): { additions: Content[]; summary: { added: number; copies: number; skipped: number } };
