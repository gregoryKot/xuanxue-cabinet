// Общий фейк ответа для auth-спеков без HTTP-стека и без Mongo.
import type { ResponseLike } from '../common/http-headers';

export function fakeResponse(): ResponseLike & {
  headers: Record<string, string | string[]>;
} {
  const headers: Record<string, string | string[]> = {};
  return {
    headers,
    setHeader: (name: string, value: string | string[]) => {
      headers[name] = value;
    },
  };
}
