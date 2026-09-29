// Проверка только того, что специфично для этой обёртки над
// useMinutesField.ts — тем же приёмом, что usePreviewMinutesField.test.ts
// рядом; сама механика диапазона/парсинга/синхронизации — useMinutesField.test.ts.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LESSON_REMINDER_MINUTES,
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
} from '@xuanxue/shared';
import type { SettingsDto } from '@xuanxue/shared';
import { useLessonReminderMinutesField } from './useLessonReminderMinutesField';

const SETTINGS: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 5,
  lessonReminderMinutes: 30,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  paymentReminder: DEFAULT_PAYMENT_REMINDER,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

describe('useLessonReminderMinutesField', () => {
  it('читает lessonReminderMinutes, не другое поле минут', () => {
    const { result } = renderHook(() => useLessonReminderMinutesField(SETTINGS, vi.fn()));

    expect(result.current.text).toBe('30');
  });

  it('без настроек — дефолт DEFAULT_LESSON_REMINDER_MINUTES', () => {
    const { result } = renderHook(() => useLessonReminderMinutesField(null, vi.fn()));

    expect(result.current.text).toBe(String(DEFAULT_LESSON_REMINDER_MINUTES));
  });

  it('save() шлёт { lessonReminderMinutes }', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useLessonReminderMinutesField(SETTINGS, update));

    act(() => result.current.setText('45'));
    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ lessonReminderMinutes: 45 });
  });

  it('меньше минимума (4) — невалидно (SETTINGS_LIMITS.lessonReminderMinutesMin = 5)', () => {
    const { result } = renderHook(() => useLessonReminderMinutesField(SETTINGS, vi.fn()));

    act(() => result.current.setText('4'));

    expect(result.current.isValid).toBe(false);
  });
});
