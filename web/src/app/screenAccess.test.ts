import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { isTeacher, showsRouteScreen } from './screenAccess';

function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: ['teacher'],
    tz: 'Asia/Jerusalem',
    status: 'active',
    telegramLinked: false,
    ...overrides,
  };
}

describe('isTeacher', () => {
  it('teacher/assistant/admin — true', () => {
    expect(isTeacher(makeMe({ roles: ['teacher'] }))).toBe(true);
    expect(isTeacher(makeMe({ roles: ['assistant'] }))).toBe(true);
    expect(isTeacher(makeMe({ roles: ['admin'] }))).toBe(true);
  });

  it('роль без teacher/assistant/admin — false', () => {
    expect(isTeacher(makeMe({ roles: [] }))).toBe(false);
  });

  it('invited — всегда false, даже если роль уже назначена', () => {
    expect(isTeacher(makeMe({ roles: ['teacher'], status: 'invited' }))).toBe(false);
  });

  it('null — false', () => {
    expect(isTeacher(null)).toBe(false);
  });
});

describe('showsRouteScreen', () => {
  it('учитель — Outlet на любом адресе кабинета', () => {
    expect(showsRouteScreen(makeMe(), '/planning')).toBe(true);
  });

  it('ученик на обычном маршруте — false (AppShell рисует StudentScreen)', () => {
    expect(showsRouteScreen(makeMe({ roles: [] }), '/planning')).toBe(false);
  });

  it('ученик на «/notifications» — true, личная настройка доступна всем', () => {
    expect(showsRouteScreen(makeMe({ roles: [] }), '/notifications')).toBe(true);
  });

  it('ученик на «/attempts/:id» — true, экран сдачи доступен всем', () => {
    expect(showsRouteScreen(makeMe({ roles: [] }), '/attempts/a1')).toBe(true);
  });

  it('invited — на обычном адресе Outlet не рисуется (та же причина, что у isTeacher)', () => {
    const invited = makeMe({ roles: ['teacher'], status: 'invited' });
    expect(showsRouteScreen(invited, '/planning')).toBe(false);
  });

  // Сама функция не знает про invited — статус проверяют раньше её вызова
  // AppShell.tsx (PendingApprovalScreen рисуется раньше проверки Outlet) и
  // firstScreenPrefetch.ts (ранний выход на invited, см. комментарий в
  // screenAccess.ts). До сюда invited в реальном приложении не долетает.
  it('invited на «/notifications» — путь совпадает сам по себе, статус не проверяется здесь', () => {
    const invited = makeMe({ roles: ['teacher'], status: 'invited' });
    expect(showsRouteScreen(invited, '/notifications')).toBe(true);
  });

  it('null на обычном адресе — false; на «/notifications»/«/attempts/:id» путь решает сам за себя', () => {
    expect(showsRouteScreen(null, '/planning')).toBe(false);
    expect(showsRouteScreen(null, '/notifications')).toBe(true);
  });
});
