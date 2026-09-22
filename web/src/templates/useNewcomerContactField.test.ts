import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_NEWCOMER_CONTACT, type SettingsDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useNewcomerContactField } from './useNewcomerContactField';

const SETTINGS_DEFAULT: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 5,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

const SETTINGS_CUSTOM: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 5,
  newcomerContact: 'Ире @irina_school',
  // Другой updatedAt, чем у SETTINGS_DEFAULT — синхронизация в хуке идёт по
  // нему (как в useSchoolSiteField.test.ts), одинаковый updatedAt у обоих
  // фикстур не запустил бы эффект заново.
  updatedAt: '2026-09-06T18:05:00.000Z',
};

describe('useNewcomerContactField — начальное значение', () => {
  it('settings ещё не загружены (null) — пустое поле, без изменений', () => {
    const { result } = renderHook(() => useNewcomerContactField(null, vi.fn()));

    expect(result.current.value).toBe('');
    expect(result.current.hasChanges).toBe(false);
  });

  it('контакт уже сохранён — поле показывает его', () => {
    const { result } = renderHook(() =>
      useNewcomerContactField(SETTINGS_CUSTOM, vi.fn()),
    );

    expect(result.current.value).toBe('Ире @irina_school');
    expect(result.current.hasChanges).toBe(false);
  });
});

describe('useNewcomerContactField — save()', () => {
  it('новый контакт — save() шлёт { newcomerContact } без пробелов по краям', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNewcomerContactField(SETTINGS_DEFAULT, update),
    );

    act(() => result.current.setValue('  Ире @irina_school  '));
    expect(result.current.hasChanges).toBe(true);

    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ newcomerContact: 'Ире @irina_school' });
    expect(result.current.pending).toBe(false);
  });

  it('поле очищено — hasChanges не взводится, save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNewcomerContactField(SETTINGS_CUSTOM, update));

    act(() => result.current.setValue('   '));
    expect(result.current.hasChanges).toBe(false);

    await act(async () => {
      await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('без изменений — save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useNewcomerContactField(SETTINGS_DEFAULT, update),
    );

    await act(async () => {
      await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('ошибка сервера — видна в error, поле не считается сохранённым', async () => {
    const update = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Контакт для новичков: заполните поле.', 400, 'invalid_input'),
      );
    const { result } = renderHook(() =>
      useNewcomerContactField(SETTINGS_DEFAULT, update),
    );

    act(() => result.current.setValue('Ире @irina_school'));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error?.message).toBe('Контакт для новичков: заполните поле.');
    expect(result.current.pending).toBe(false);
  });
});

describe('useNewcomerContactField — синхронизация с сохранённым', () => {
  it('settings.updatedAt изменился (после успешного «Сохранить») — поле обновляется', () => {
    const { result, rerender } = renderHook(
      ({ settings }: { settings: SettingsDto | null }) =>
        useNewcomerContactField(settings, vi.fn()),
      { initialProps: { settings: SETTINGS_DEFAULT } },
    );

    rerender({ settings: SETTINGS_CUSTOM });

    expect(result.current.value).toBe('Ире @irina_school');
  });
});
