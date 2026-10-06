import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import {
  canSeePayments,
  canSeeRoute,
  isAccountant,
  isTeacher,
  rootPathFor,
} from './screenAccess';

function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: ['teacher'],
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    noTelegram: false,
    hasEmail: true,
    needsProfile: false,
    googleLinked: false,
    studentMode: false,
    canUseStudentMode: false,
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

describe('canSeePayments', () => {
  it('бухгалтер и админ — true', () => {
    expect(canSeePayments(makeMe({ roles: ['accountant'] }))).toBe(true);
    expect(canSeePayments(makeMe({ roles: ['admin'] }))).toBe(true);
  });

  it('учитель, ассистент, ученик и null — false', () => {
    expect(canSeePayments(makeMe({ roles: ['teacher'] }))).toBe(false);
    expect(canSeePayments(makeMe({ roles: ['assistant'] }))).toBe(false);
    expect(canSeePayments(makeMe({ roles: [] }))).toBe(false);
    expect(canSeePayments(null)).toBe(false);
  });
});

describe('isAccountant', () => {
  it('бухгалтер без ролей штата — true', () => {
    expect(isAccountant(makeMe({ roles: ['accountant'] }))).toBe(true);
  });

  it('бухгалтер с ролью штата — false: он штат, меню штата', () => {
    expect(isAccountant(makeMe({ roles: ['accountant', 'teacher'] }))).toBe(false);
    expect(isAccountant(makeMe({ roles: ['accountant', 'admin'] }))).toBe(false);
  });

  it('без роли бухгалтера и null — false', () => {
    expect(isAccountant(makeMe({ roles: [] }))).toBe(false);
    expect(isAccountant(null)).toBe(false);
  });
});

describe('rootPathFor', () => {
  // Решение владельца 2026-09-27 (ADR-0138): «Экзамены» — основной экран
  // штата при входе, было «Занятия»/планирование.
  it('штат — «Экзамены»', () => {
    expect(rootPathFor(makeMe({ roles: ['teacher'] }))).toBe('/exams');
    expect(rootPathFor(makeMe({ roles: ['assistant'] }))).toBe('/exams');
    expect(rootPathFor(makeMe({ roles: ['admin'] }))).toBe('/exams');
  });

  it('бухгалтер без ролей штата — «Оплаты» (ADR-0171)', () => {
    expect(rootPathFor(makeMe({ roles: ['accountant'] }))).toBe('/payments');
  });

  it('бухгалтер с ролью штата — корень штата', () => {
    expect(rootPathFor(makeMe({ roles: ['accountant', 'teacher'] }))).toBe('/exams');
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

  // ADR-0171: «Оплаты» открыты тем, кто их видит; учитель штата — нет, хотя
  // остальные маршруты штата ему открыты.
  it('«/payments» — бухгалтеру и админу true, учителю и ученику false', () => {
    expect(canSeeRoute(makeMe({ roles: ['accountant'] }), '/payments')).toBe(true);
    expect(canSeeRoute(makeMe({ roles: ['admin'] }), '/payments')).toBe(true);
    expect(canSeeRoute(makeMe({ roles: ['teacher'] }), '/payments')).toBe(false);
    expect(canSeeRoute(makeMe({ roles: [] }), '/payments')).toBe(false);
  });

  it('бухгалтер без ролей штата на маршруте штата — false', () => {
    expect(canSeeRoute(makeMe({ roles: ['accountant'] }), '/planning')).toBe(false);
  });

  it('ученик на маршруте штата — false, его уводит редиректом AppShell', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/planning')).toBe(false);
    expect(canSeeRoute(makeMe({ roles: [] }), '/exams')).toBe(false);
    expect(canSeeRoute(makeMe({ roles: [] }), '/channels')).toBe(false);
  });

  // Журнал сбоев (ADR-0132) — не в списке путей, открытых ученику: этот
  // гвард (canSeeRoute) блокирует его как любой другой маршрут штата, а
  // тонкую разницу teacher/admin держит уже RequireDevErrorsAccess.tsx
  // (RequireDevErrorsAccess.test.tsx), не эта функция.
  it('ученик на «/dev/errors» — false, тот же маршрут штата', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/dev/errors')).toBe(false);
  });

  it('admin на «/dev/errors» — true, маршрут штата открыт любому его члену', () => {
    expect(canSeeRoute(makeMe({ roles: ['admin'] }), '/dev/errors')).toBe(true);
  });

  // ADR-0075 «Ученику экран тега пока не даётся»: /materials/tags не назван
  // в списке открытых ученику путей — как и /materials сам по себе.
  it('ученик на «/materials/tags» — false, экран тега пока только штату', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/materials')).toBe(false);
    expect(canSeeRoute(makeMe({ roles: [] }), '/materials/tags')).toBe(false);
  });

  it('ученик на своих «/tasks»/«/lessons»/«/archive»/«/library» — true', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/tasks')).toBe(true);
    expect(canSeeRoute(makeMe({ roles: [] }), '/lessons')).toBe(true);
    expect(canSeeRoute(makeMe({ roles: [] }), '/archive')).toBe(true);
    expect(canSeeRoute(makeMe({ roles: [] }), '/library')).toBe(true);
  });

  it('ученик на «/profile» — true, личный экран доступен всем (ADR-0045)', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/profile')).toBe(true);
  });

  it('ученик на «/install» — true, инструкция установки доступна всем (docs/PWA.md)', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/install')).toBe(true);
  });

  it('ученик на «/notifications» — true, лента событий доступна всем (ADR-0063)', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/notifications')).toBe(true);
  });

  it('ученик на «/notifications/settings» — true, настройки уведомлений доступны всем (ADR-0162)', () => {
    expect(canSeeRoute(makeMe({ roles: [] }), '/notifications/settings')).toBe(true);
    expect(
      canSeeRoute(makeMe({ roles: ['accountant'] }), '/notifications/settings'),
    ).toBe(true);
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
