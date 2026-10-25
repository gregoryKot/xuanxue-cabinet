import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  type SettingsDto,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useDataControllerFields } from './useDataControllerFields';

const SETTINGS_EMPTY: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 5,
  lessonReminderMinutes: 60,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  paymentContact: DEFAULT_PAYMENT_CONTACT,
  paymentReminder: DEFAULT_PAYMENT_REMINDER,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

const SETTINGS_FILLED: SettingsDto = {
  ...SETTINGS_EMPTY,
  dataControllerName: 'Дмитрий Дейч',
  dataControllerContact: 'privacy@xuanxue.su',
  // Синхронизация в хуке идёт по updatedAt (useSettingsTextField.ts): одинаковый
  // updatedAt у обеих фикстур не запустил бы эффект заново.
  updatedAt: '2026-09-06T18:05:00.000Z',
};

describe('useDataControllerFields — начальное значение', () => {
  it('настройки не загружены — оба поля пустые, без изменений', () => {
    const { result } = renderHook(() => useDataControllerFields(null, vi.fn()));

    expect(result.current.name.value).toBe('');
    expect(result.current.contact.value).toBe('');
    expect(result.current.name.hasChanges).toBe(false);
    expect(result.current.contact.hasChanges).toBe(false);
  });

  it('школа ничего не указывала (полей нет) — поля пустые, не «undefined»', () => {
    const { result } = renderHook(() => useDataControllerFields(SETTINGS_EMPTY, vi.fn()));

    expect(result.current.name.value).toBe('');
    expect(result.current.contact.value).toBe('');
  });

  it('уже сохранённые значения показаны в полях', () => {
    const { result } = renderHook(() =>
      useDataControllerFields(SETTINGS_FILLED, vi.fn()),
    );

    expect(result.current.name.value).toBe('Дмитрий Дейч');
    expect(result.current.contact.value).toBe('privacy@xuanxue.su');
    expect(result.current.name.hasChanges).toBe(false);
  });
});

describe('useDataControllerFields — save()', () => {
  it('имя — шлёт только dataControllerName, без пробелов по краям', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDataControllerFields(SETTINGS_EMPTY, update));

    act(() => result.current.name.setValue('  Дмитрий Дейч  '));
    expect(result.current.name.hasChanges).toBe(true);
    expect(result.current.contact.hasChanges).toBe(false);

    await act(async () => {
      await result.current.name.save();
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ dataControllerName: 'Дмитрий Дейч' });
  });

  it('контакт — шлёт только dataControllerContact', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDataControllerFields(SETTINGS_EMPTY, update));

    act(() => result.current.contact.setValue('@dmitry_deitch'));
    await act(async () => {
      await result.current.contact.save();
    });

    expect(update).toHaveBeenCalledWith({ dataControllerContact: '@dmitry_deitch' });
  });

  it('поле очищено — hasChanges взведён, save() шлёт null (снятие)', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDataControllerFields(SETTINGS_FILLED, update));

    act(() => result.current.name.setValue('   '));
    expect(result.current.name.hasChanges).toBe(true);
    await act(async () => {
      await result.current.name.save();
    });
    expect(update).toHaveBeenCalledWith({ dataControllerName: null });

    act(() => result.current.contact.setValue(''));
    await act(async () => {
      await result.current.contact.save();
    });
    expect(update).toHaveBeenCalledWith({ dataControllerContact: null });
  });

  it('без изменений — save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDataControllerFields(SETTINGS_FILLED, update));

    await act(async () => {
      await result.current.name.save();
      await result.current.contact.save();
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('ошибка сервера — видна в error своего поля, второе поле чистое', async () => {
    const update = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'Кто отвечает за данные учеников: слишком длинный текст.',
          400,
          'invalid_input',
        ),
      );
    const { result } = renderHook(() => useDataControllerFields(SETTINGS_EMPTY, update));

    act(() => result.current.name.setValue('Дмитрий Дейч'));
    await act(async () => {
      await result.current.name.save();
    });

    expect(result.current.name.error?.message).toBe(
      'Кто отвечает за данные учеников: слишком длинный текст.',
    );
    expect(result.current.contact.error).toBeNull();
    expect(result.current.name.pending).toBe(false);
  });

  it('сбой не от сервера (сеть, таймаут) — общий текст с действием', async () => {
    const update = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDataControllerFields(SETTINGS_EMPTY, update));

    act(() => result.current.contact.setValue('@dmitry_deitch'));
    await act(async () => {
      await result.current.contact.save();
    });

    expect(result.current.contact.error?.message).toBe(
      'Не удалось сохранить способ связи. Попробуйте ещё раз.',
    );
  });
});

describe('useDataControllerFields — синхронизация с сохранённым', () => {
  it('settings.updatedAt изменился (после успешного «Сохранить») — поля обновляются', () => {
    const { result, rerender } = renderHook(
      ({ settings }: { settings: SettingsDto | null }) =>
        useDataControllerFields(settings, vi.fn()),
      { initialProps: { settings: SETTINGS_EMPTY } },
    );

    rerender({ settings: SETTINGS_FILLED });

    expect(result.current.name.value).toBe('Дмитрий Дейч');
    expect(result.current.contact.value).toBe('privacy@xuanxue.su');
  });
});
