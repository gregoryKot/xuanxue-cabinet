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

  // Статуса «ждёт подтверждения» больше нет (ADR-0035) — функция не ветвится
  // по `me.status`: blocked до неё не доходит (RequireAuth), а active с
  // ролью штата и без неё различаются только ролями.
  it('status не влияет: active-учитель — Outlet, active-ученик — StudentScreen', () => {
    expect(showsRouteScreen(makeMe({ status: 'active' }), '/planning')).toBe(true);
    expect(showsRouteScreen(makeMe({ roles: [], status: 'active' }), '/planning')).toBe(
      false,
    );
  });

  it('null на обычном адресе — false; на «/notifications»/«/attempts/:id» путь решает сам за себя', () => {
    expect(showsRouteScreen(null, '/planning')).toBe(false);
    expect(showsRouteScreen(null, '/notifications')).toBe(true);
  });
});
