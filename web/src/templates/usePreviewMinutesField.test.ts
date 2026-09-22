import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PREVIEW_MINUTES,
  type SettingsDto,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { usePreviewMinutesField } from './usePreviewMinutesField';

const SETTINGS_DEFAULT: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: DEFAULT_PREVIEW_MINUTES,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

const SETTINGS_CUSTOM: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 15,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  // Другой updatedAt, чем у SETTINGS_DEFAULT — синхронизация в хуке идёт по
  // нему (как texts в TemplatesScreen.tsx), одинаковый updatedAt у обоих
  // фикстур не запустил бы эффект заново.
  updatedAt: '2026-09-06T18:05:00.000Z',
};

describe('usePreviewMinutesField — начальное значение', () => {
  it('settings ещё не загружены (null) — дефолт в поле, без изменений', () => {
    const { result } = renderHook(() => usePreviewMinutesField(null, vi.fn()));

    expect(result.current.text).toBe(String(DEFAULT_PREVIEW_MINUTES));
    expect(result.current.hasChanges).toBe(false);
  });

  it('значение уже сохранено — поле показывает его', () => {
    const { result } = renderHook(() => usePreviewMinutesField(SETTINGS_CUSTOM, vi.fn()));

    expect(result.current.text).toBe('15');
    expect(result.current.hasChanges).toBe(false);
  });
});

describe('usePreviewMinutesField — валидация', () => {
  it('0 — вне диапазона, hasChanges не взводится', () => {
    const { result } = renderHook(() =>
      usePreviewMinutesField(SETTINGS_DEFAULT, vi.fn()),
    );

    act(() => result.current.setText('0'));

    expect(result.current.isValid).toBe(false);
    expect(result.current.hasChanges).toBe(false);
  });

  it('1441 — вне диапазона', () => {
    const { result } = renderHook(() =>
      usePreviewMinutesField(SETTINGS_DEFAULT, vi.fn()),
    );

    act(() => result.current.setText('1441'));

    expect(result.current.isValid).toBe(false);
  });

  it('дробное число — невалидно', () => {
    const { result } = renderHook(() =>
      usePreviewMinutesField(SETTINGS_DEFAULT, vi.fn()),
    );

    act(() => result.current.setText('5.5'));

    expect(result.current.isValid).toBe(false);
  });

  it('пустое поле — невалидно, не превращается в 0', () => {
    const { result } = renderHook(() =>
      usePreviewMinutesField(SETTINGS_DEFAULT, vi.fn()),
    );

    act(() => result.current.setText(''));

    expect(result.current.isValid).toBe(false);
  });
});

describe('usePreviewMinutesField — save()', () => {
  it('новое значение — save() шлёт { previewMinutes } числом', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePreviewMinutesField(SETTINGS_DEFAULT, update));

    act(() => result.current.setText('10'));
    expect(result.current.hasChanges).toBe(true);

    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ previewMinutes: 10 });
    expect(result.current.pending).toBe(false);
  });

  it('без изменений — save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePreviewMinutesField(SETTINGS_DEFAULT, update));

    await act(async () => {
      await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('невалидное значение — save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePreviewMinutesField(SETTINGS_DEFAULT, update));

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
    const { result } = renderHook(() => usePreviewMinutesField(SETTINGS_DEFAULT, update));

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

describe('usePreviewMinutesField — синхронизация с сохранённым', () => {
  it('settings.updatedAt изменился (после успешного «Сохранить») — поле обновляется', () => {
    const { result, rerender } = renderHook(
      ({ settings }: { settings: SettingsDto | null }) =>
        usePreviewMinutesField(settings, vi.fn()),
      { initialProps: { settings: SETTINGS_DEFAULT } },
    );

    rerender({ settings: SETTINGS_CUSTOM });

    expect(result.current.text).toBe('15');
  });
});
