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

  it('lesson_soon — ближайшие занятия ученика (ADR-0135)', () => {
    expect(notificationTarget(item({ kind: 'lesson_soon', lessonId: 'l1' }))).toBe(
      '/lessons',
    );
  });

  it('lesson_cancelled — те же ближайшие занятия: отменённое занятие там с пометкой (ADR-0162)', () => {
    expect(notificationTarget(item({ kind: 'lesson_cancelled', lessonId: 'l1' }))).toBe(
      '/lessons',
    );
  });

  it('recording_ready — «Записи занятий» ученика: запись лежит там, не на «Занятиях» (ADR-0162)', () => {
    expect(notificationTarget(item({ kind: 'recording_ready', lessonId: 'l1' }))).toBe(
      '/archive',
    );
  });

  it('material_new — «Библиотека» ученика, где лежит новый материал (ADR-0162)', () => {
    expect(notificationTarget(item({ kind: 'material_new' }))).toBe('/library');
  });

  it('payment_due — экрана оплаты у ученика ещё нет (слой 2.4), ссылки нет', () => {
    expect(
      notificationTarget(item({ kind: 'payment_due', text: 'Абонемент' })),
    ).toBeUndefined();
  });

  it('вид без своего экрана (payments) — вести некуда', () => {
    expect(notificationTarget(item({ kind: 'payments' }))).toBeUndefined();
  });
});
