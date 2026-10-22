import type { Content, ContentFields } from '../src/types';
export class AppError extends Error {
  status: number;
  constructor(message: string, status?: number);
}
export const CHANNELS: string[];
export const COLORS: string[];
export const CHECKS: string[];
export function validateFields(input: unknown): ContentFields;
export function createContent(input: ContentFields, isExample?: boolean): Content;
export function updateContent(content: Content, input: ContentFields): Content;
export function addEvent(content: Content, action: string, message: string, at?: string): Content;
export function transition(
  content: Content,
  input: { action: string; message?: string; checks?: Record<string, boolean> },
): Content;
export function publicationEnvelope(content: Content): unknown;
