// Тесты общей механики (useSchoolSiteField.test.ts и
// useNewcomerContactField.test.ts уже покрывают её через свои обёртки) —
// здесь только то, что специфично для самого хука: чтение/запись через
// переданные read/write и `isValid` как отдельный рычаг допустимости
// пустого значения.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_NEWCOMER_CONTACT, type SettingsDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useSettingsTextField } from './useSettingsTextField';

const SETTINGS: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 5,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

// Поле-заглушка поверх newcomerContact — read/write здесь не те, что в
// useNewcomerContactField.ts, ровно чтобы проверить, что хук зовёт именно
// переданные функции, а не что-то своё зашитое.
const read = (s: SettingsDto) => s.newcomerContact;
const write = (trimmed: string) => ({ newcomerContact: trimmed });
const SAVE_ERROR = 'Не удалось сохранить.';

describe('useSettingsTextField — read/write', () => {
  it('settings ещё не загружены — пустое значение, read() не зовётся', () => {
    const readSpy = vi.fn(read);
    const { result } = renderHook(() =>
      useSettingsTextField(null, vi.fn(), {
        read: readSpy,
        write,
        saveError: SAVE_ERROR,
      }),
    );

    expect(result.current.value).toBe('');
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('settings есть — значение поля из read(settings)', () => {
    const { result } = renderHook(() =>
      useSettingsTextField(SETTINGS, vi.fn(), { read, write, saveError: SAVE_ERROR }),
    );

    expect(result.current.value).toBe(DEFAULT_NEWCOMER_CONTACT);
  });

  it('save() шлёт update(write(trimmed))', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSettingsTextField(SETTINGS, update, { read, write, saveError: SAVE_ERROR }),
    );

    act(() => result.current.setValue('  новое значение  '));
    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ newcomerContact: 'новое значение' });
  });
});

describe('useSettingsTextField — isValid', () => {
  it('без isValid пустое значение допустимо (по умолчанию)', () => {
    const { result } = renderHook(() =>
      useSettingsTextField(SETTINGS, vi.fn(), { read, write, saveError: SAVE_ERROR }),
    );

    act(() => result.current.setValue(''));

    expect(result.current.hasChanges).toBe(true);
  });

  it('isValid запрещает пустое значение — hasChanges не взводится, save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSettingsTextField(SETTINGS, update, {
        read,
        write,
        saveError: SAVE_ERROR,
        isValid: (trimmed) => trimmed !== '',
      }),
    );

    act(() => result.current.setValue('   '));
    expect(result.current.hasChanges).toBe(false);

    await act(async () => {
      await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('isValid запрещает конкретное значение — save() его не отправляет, hasChanges снят', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSettingsTextField(SETTINGS, update, {
        read,
        write,
        saveError: SAVE_ERROR,
        isValid: (trimmed) => trimmed !== 'плохое значение',
      }),
    );

    act(() => result.current.setValue('плохое значение'));
    expect(result.current.hasChanges).toBe(false);

    await act(async () => {
      await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
  });
});

describe('useSettingsTextField — ошибка сервера', () => {
  it('save() отклонён ApiError — error.message из ответа, pending снят', async () => {
    const update = vi
      .fn()
      .mockRejectedValue(new ApiError('Ошибка сервера.', 400, 'invalid_input'));
    const { result } = renderHook(() =>
      useSettingsTextField(SETTINGS, update, { read, write, saveError: SAVE_ERROR }),
    );

    act(() => result.current.setValue('новое значение'));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error?.message).toBe('Ошибка сервера.');
    expect(result.current.pending).toBe(false);
  });

  it('save() отклонён не-ApiError — fallback saveError', async () => {
    const update = vi.fn().mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() =>
      useSettingsTextField(SETTINGS, update, { read, write, saveError: SAVE_ERROR }),
    );

    act(() => result.current.setValue('новое значение'));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error?.message).toBe(SAVE_ERROR);
  });
});

describe('useSettingsTextField — синхронизация с сохранённым', () => {
  it('settings.updatedAt изменился — поле обновляется по read() новых settings', () => {
    const changed: SettingsDto = {
      ...SETTINGS,
      newcomerContact: 'Ире @irina_school',
      updatedAt: '2026-09-06T18:05:00.000Z',
    };
    const { result, rerender } = renderHook(
      ({ settings }: { settings: SettingsDto }) =>
        useSettingsTextField(settings, vi.fn(), { read, write, saveError: SAVE_ERROR }),
      { initialProps: { settings: SETTINGS } },
    );

    rerender({ settings: changed });

    expect(result.current.value).toBe('Ире @irina_school');
  });
});
