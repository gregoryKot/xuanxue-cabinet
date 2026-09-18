import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { canSeeRoute, isTeacher, rootPathFor } from './screenAccess';

function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: ['teacher'],
    tz: 'Asia/Jerusalem',
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    needsProfile: false,
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

describe('rootPathFor', () => {
  it('штат — «Занятия» (планирование)', () => {
    expect(rootPathFor(makeMe({ roles: ['teacher'] }))).toBe('/planning');
    expect(rootPathFor(makeMe({ roles: ['assistant'] }))).toBe('/planning');
    expect(rootPathFor(makeMe({ roles: ['admin'] }))).toBe('/planning');
  });

  it('ученик — «Задания» (решение владельца: экзамены — первый экран)', () => {
    expect(rootPathFor(makeMe({ roles: [] }))).toBe('/tasks');
  });

  it('сессия ещё не известна (null) — тот же безопасный минимум, что у ученика', () => {
    expect(rootPathFor(null)).toBe('/tasks');
  });
});

describe('canSeeRoute', () => {
  it('штат — маршрут открыт на любом адресе кабинета', () => {
    expect(canSeeRoute(makeMe(), '/planning')).toBe(true);
    expect(canSeeRoute(makeMe(), '/exams')).toBe(true);
  });

  it('ученик на маршруте штата — false, его уводит редиректом AppShell', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/planning')).toBe(false);
    expect(canSeeRoute(makeMe({ roles: [] }), '/exams')).toBe(false);
    expect(canSeeRoute(makeMe({ roles: [] }), '/channels')).toBe(false);
  });

  it('ученик на своих «/tasks»/«/lessons» — true', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/tasks')).toBe(true);
    expect(canSeeRoute(makeMe({ roles: [] }), '/lessons')).toBe(true);
  });

  it('ученик на «/profile» — true, личный экран доступен всем (ADR-0045)', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/profile')).toBe(true);
  });

  it('ученик на «/attempts/:id» — true, экран сдачи доступен всем', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/attempts/a1')).toBe(true);
  });

  // Статуса «ждёт подтверждения» больше нет (ADR-0036) — функция не ветвится
  // по `me.status`: blocked до неё не доходит (RequireAuth), а active с
  // ролью штата и без неё различаются только ролями.
  it('status не влияет: active-учитель — true, active-ученик на маршруте штата — false', () => {
    expect(canSeeRoute(makeMe({ status: 'active' }), '/planning')).toBe(true);
    expect(canSeeRoute(makeMe({ roles: [], status: 'active' }), '/planning')).toBe(false);
  });

  it('null на маршруте штата — false; на открытых всем путях путь решает сам за себя', () => {
    expect(canSeeRoute(null, '/planning')).toBe(false);
    expect(canSeeRoute(null, '/profile')).toBe(true);
    expect(canSeeRoute(null, '/tasks')).toBe(true);
  });
});
