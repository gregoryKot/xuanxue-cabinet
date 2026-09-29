import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { isMyPaymentsVisible, isPaymentContactVisible } from './myPaymentsVisibility';

const STUDENT = { id: 's1', name: 'Ирина', roles: [] } as unknown as MeDto;
const TEACHER = { ...STUDENT, roles: ['teacher'] } as unknown as MeDto;

describe('isMyPaymentsVisible (ADR-0157)', () => {
  it('по умолчанию секция спрятана — даже у ученика', () => {
    expect(isMyPaymentsVisible(STUDENT)).toBe(false);
  });

  it('флаг включён — ученик видит, штат и незагруженный профиль нет', () => {
    expect(isMyPaymentsVisible(STUDENT, true)).toBe(true);
    expect(isMyPaymentsVisible(TEACHER, true)).toBe(false);
    expect(isMyPaymentsVisible(null, true)).toBe(false);
  });
});

describe('isPaymentContactVisible (ADR-0159)', () => {
  it('ученик без ролей видит контакт бухгалтера', () => {
    expect(isPaymentContactVisible(STUDENT)).toBe(true);
  });

  it('штат и незагруженный профиль — нет', () => {
    expect(isPaymentContactVisible(TEACHER)).toBe(false);
    expect(isPaymentContactVisible(null)).toBe(false);
  });
});
