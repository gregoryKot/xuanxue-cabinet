import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  DEFAULT_PREVIEW_MINUTES,
  SETTINGS_LIMITS,
  type SettingsDto,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useMinutesField, type UseMinutesFieldOptions } from './useMinutesField';

const SETTINGS_DEFAULT: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: DEFAULT_PREVIEW_MINUTES,
  lessonReminderMinutes: 60,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  paymentReminder: DEFAULT_PAYMENT_REMINDER,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

const SETTINGS_CUSTOM: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 15,
  lessonReminderMinutes: 60,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  paymentReminder: DEFAULT_PAYMENT_REMINDER,
  // Другой updatedAt, чем у SETTINGS_DEFAULT — сверка с сохранённым в хуке
  // идёт по нему (useSavedDraft.ts), одинаковый updatedAt у обеих фикстур не
  // запустил бы её заново.
  updatedAt: '2026-09-06T18:05:00.000Z',
};

const OPTIONS: UseMinutesFieldOptions = {
  read: (s) => s.previewMinutes,
  write: (previewMinutes) => ({ previewMinutes }),
  defaultValue: DEFAULT_PREVIEW_MINUTES,
  min: SETTINGS_LIMITS.previewMinutesMin,
  max: SETTINGS_LIMITS.previewMinutesMax,
  saveError: 'Не удалось сохранить время предпросмотра. Попробуйте ещё раз.',
};

describe('useMinutesField — начальное значение', () => {
  it('settings ещё не загружены (null) — дефолт в поле, без изменений', () => {
    const { result } = renderHook(() => useMinutesField(null, vi.fn(), OPTIONS));

    expect(result.current.text).toBe(String(DEFAULT_PREVIEW_MINUTES));
    expect(result.current.hasChanges).toBe(false);
  });

  it('значение уже сохранено — поле показывает его', () => {
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_CUSTOM, vi.fn(), OPTIONS),
    );

    expect(result.current.text).toBe('15');
    expect(result.current.hasChanges).toBe(false);
  });
});

describe('useMinutesField — валидация', () => {
  it('0 — вне диапазона, hasChanges не взводится', () => {
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_DEFAULT, vi.fn(), OPTIONS),
    );

    act(() => result.current.setText('0'));

    expect(result.current.isValid).toBe(false);
    expect(result.current.hasChanges).toBe(false);
  });

  it('1441 — вне диапазона', () => {
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_DEFAULT, vi.fn(), OPTIONS),
    );

    act(() => result.current.setText('1441'));

    expect(result.current.isValid).toBe(false);
  });

  it('дробное число — невалидно', () => {
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_DEFAULT, vi.fn(), OPTIONS),
    );

    act(() => result.current.setText('5.5'));

    expect(result.current.isValid).toBe(false);
  });

  it('пустое поле — невалидно, не превращается в 0', () => {
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_DEFAULT, vi.fn(), OPTIONS),
    );

    act(() => result.current.setText(''));

    expect(result.current.isValid).toBe(false);
  });

  it('другой диапазон (min/max из опций, не константа) — за нижней границей невалидно', () => {
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_DEFAULT, vi.fn(), {
        ...OPTIONS,
        read: () => 60,
        min: 5,
        max: 1440,
      }),
    );

    act(() => result.current.setText('4'));

    expect(result.current.isValid).toBe(false);
  });
});

describe('useMinutesField — save()', () => {
  it('новое значение — save() шлёт тело из write() числом', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_DEFAULT, update, OPTIONS),
    );

    act(() => result.current.setText('10'));
    expect(result.current.hasChanges).toBe(true);

    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ previewMinutes: 10 });
    expect(result.current.pending).toBe(false);
  });

  it('write() своё поле — другой набор опций шлёт другое тело', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_DEFAULT, update, {
        ...OPTIONS,
        read: (s) => s.lessonReminderMinutes,
        write: (lessonReminderMinutes) => ({ lessonReminderMinutes }),
        defaultValue: 60,
      }),
    );

    act(() => result.current.setText('45'));
    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ lessonReminderMinutes: 45 });
  });

  it('без изменений — save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_DEFAULT, update, OPTIONS),
    );

    await act(async () => {
      await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('невалидное значение — save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_DEFAULT, update, OPTIONS),
    );

    act(() => result.current.setText('9999'));
    await act(async () => {
      await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('ошибка сервера — видна в error, поле не считается сохранённым', async () => {
    const update = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'За сколько минут показывать черновик: должно быть не больше 1440.',
          400,
          'invalid_input',
        ),
      );
    const { result } = renderHook(() =>
      useMinutesField(SETTINGS_DEFAULT, update, OPTIONS),
    );

    act(() => result.current.setText('10'));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error?.message).toBe(
      'За сколько минут показывать черновик: должно быть не больше 1440.',
    );
    expect(result.current.pending).toBe(false);
  });
});

describe('useMinutesField — синхронизация с сохранённым', () => {
  it('settings.updatedAt изменился (после успешного «Сохранить») — поле обновляется', () => {
    const { result, rerender } = renderHook(
      ({ settings }: { settings: SettingsDto | null }) =>
        useMinutesField(settings, vi.fn(), OPTIONS),
      { initialProps: { settings: SETTINGS_DEFAULT } },
    );

    rerender({ settings: SETTINGS_CUSTOM });

    expect(result.current.text).toBe('15');
  });
});
