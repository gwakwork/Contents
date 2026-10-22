import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  existsSync,
  chmodSync,
  unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from './domain.mjs';

export const DEFAULT_MODEL = 'gpt-4.1-mini';
export function createAISettings({ file, environmentKey = '', environmentModel = '' }) {
  function read() {
    if (!existsSync(file)) return { version: 1, model: DEFAULT_MODEL, apiKey: '' };
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      if (data.version !== 1 || typeof data.apiKey !== 'string' || typeof data.model !== 'string')
        throw new Error();
      return data;
    } catch {
      throw new AppError(
        'AI 설정 파일을 읽지 못했어요. 파일을 보존한 채 지원을 요청해 주세요.',
        409,
      );
    }
  }
  function credentials() {
    const local = read();
    return {
      apiKey: environmentKey || local.apiKey,
      model: environmentModel || local.model,
      source: environmentKey ? 'environment' : local.apiKey ? 'local' : 'none',
    };
  }
  function status() {
    const { apiKey, model, source } = credentials();
    return { configured: Boolean(apiKey), model, source };
  }
  function write(data) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, file);
      chmodSync(file, 0o600);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  return {
    credentials,
    status,
    save(input) {
      const local = read();
      if (typeof input.model !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(input.model))
        throw new AppError('사용할 모델 이름을 확인해 주세요.');
      if (
        input.apiKey !== undefined &&
        (typeof input.apiKey !== 'string' ||
          input.apiKey.trim().length < 12 ||
          input.apiKey.length > 2000 ||
          /[\r\n]/.test(input.apiKey))
      )
        throw new AppError('OpenAI에서 발급한 API 키를 확인해 주세요.');
      write({
        ...local,
        model: input.model,
        apiKey: input.apiKey === undefined ? local.apiKey : input.apiKey.trim(),
      });
      return status();
    },
    clear() {
      const local = read();
      write({ ...local, apiKey: '' });
      return status();
    },
  };
}
