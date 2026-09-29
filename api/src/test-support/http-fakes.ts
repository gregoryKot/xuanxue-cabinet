// Общие фейки для auth-спеков без HTTP-стека и без Mongo — дублировались в
// auth.guard.spec, auth.controller.spec, auth.service.spec.
import { ConfigService } from '@nestjs/config';
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

export function fakeConfig(nodeEnv: string): ConfigService {
  return { get: () => nodeEnv } as unknown as ConfigService;
}
