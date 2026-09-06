import { describe, expect, it } from 'vitest';
import { isMutatingMethod } from './auth';

describe('isMutatingMethod', () => {
  it.each(['POST', 'PATCH', 'PUT', 'DELETE', 'post', 'delete'])(
    '%s — мутирующий',
    (method) => {
      expect(isMutatingMethod(method)).toBe(true);
    },
  );

  it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('%s — не мутирующий', (method) => {
    expect(isMutatingMethod(method)).toBe(false);
  });
});
