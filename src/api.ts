import { LOCAL_MODE, localApi } from './local-api';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (LOCAL_MODE) return localApi<T>(path, options);
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '요청을 처리하지 못했어요. 연결 상태를 확인해 주세요.');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
