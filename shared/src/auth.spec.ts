import { describe, expect, it } from 'vitest';
import { isMutatingMethod, ROLE_LABELS, USER_ROLES } from './auth';

describe('ROLE_LABELS', () => {
  it('у каждой роли из USER_ROLES есть подпись, и лишних подписей нет', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...USER_ROLES].sort());
  });

  it('каждая подпись — непустая строка', () => {
    for (const role of USER_ROLES) {
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });
});

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
