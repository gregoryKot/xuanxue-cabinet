// Проверка только того, что специфично для этой обёртки над
// useMinutesField.ts (какое поле читает/пишет, дефолт, диапазон) — сама
// механика диапазона/парсинга/синхронизации покрыта useMinutesField.test.ts.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  DEFAULT_PREVIEW_MINUTES,
} from '@xuanxue/shared';
import type { SettingsDto } from '@xuanxue/shared';
import { usePreviewMinutesField } from './usePreviewMinutesField';

const SETTINGS: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 15,
  lessonReminderMinutes: 60,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  paymentReminder: DEFAULT_PAYMENT_REMINDER,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

describe('usePreviewMinutesField', () => {
  it('читает previewMinutes, не другое поле минут', () => {
    const { result } = renderHook(() => usePreviewMinutesField(SETTINGS, vi.fn()));

    expect(result.current.text).toBe('15');
  });

  it('без настроек — дефолт DEFAULT_PREVIEW_MINUTES', () => {
    const { result } = renderHook(() => usePreviewMinutesField(null, vi.fn()));

    expect(result.current.text).toBe(String(DEFAULT_PREVIEW_MINUTES));
  });

  it('save() шлёт { previewMinutes }', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePreviewMinutesField(SETTINGS, update));

    act(() => result.current.setText('20'));
    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ previewMinutes: 20 });
  });
});
