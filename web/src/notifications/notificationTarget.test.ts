// Адрес строки ленты — чистая логика без DOM и без сети, юнит-тест на все
// ветки (CLAUDE.md «Тесты»).
import { describe, expect, it } from 'vitest';
import type { NotificationDto } from '@xuanxue/shared';
import { notificationTarget } from './notificationTarget';

function item(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: 'n1',
    kind: 'exam_result',
    text: 'Текст',
    createdAt: '2026-09-20T09:00:00.000Z',
    ...overrides,
  };
}

describe('notificationTarget', () => {
  it('exam_result — карточка экзамена в «Заданиях»', () => {
    expect(notificationTarget(item({ kind: 'exam_result' }))).toBe('/tasks');
  });

  it('attempt_submitted с attemptId — проверка именно этой попытки', () => {
    expect(notificationTarget(item({ kind: 'attempt_submitted', attemptId: 'a1' }))).toBe(
      '/grading/a1',
    );
  });

  it('attempt_submitted без attemptId — вести некуда, ссылки нет', () => {
    expect(notificationTarget(item({ kind: 'attempt_submitted' }))).toBeUndefined();
  });

  it('вид без своего экрана (payments) — вести некуда', () => {
    expect(notificationTarget(item({ kind: 'payments' }))).toBeUndefined();
  });
});
