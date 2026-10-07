import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SettingsDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { SETTINGS_EMPTY } from './boardTestRender';
import { useBoardNoticeForm } from './useBoardNoticeForm';

const SETTINGS_FILLED: SettingsDto = {
  ...SETTINGS_EMPTY,
  boardNotice: { text: 'Ретрит в ноябре', until: '2026-10-20' },
  // Синхронизация идёт по updatedAt (useSavedDraft.ts): у второй фикстуры он другой.
  updatedAt: '2026-10-06T10:05:00.000Z',
};

describe('useBoardNoticeForm — начальное значение', () => {
  it('настройки не загружены — пусто, без изменений', () => {
    const { result } = renderHook(() => useBoardNoticeForm(null, vi.fn()));

    expect(result.current.form).toEqual({ text: '', until: '' });
    expect(result.current.hasChanges).toBe(false);
  });

  it('объявления нет — поля пустые, не «undefined»', () => {
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_EMPTY, vi.fn()));

    expect(result.current.form).toEqual({ text: '', until: '' });
  });

  it('сохранённое объявление показано в полях', () => {
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_FILLED, vi.fn()));

    expect(result.current.form).toEqual({ text: 'Ретрит в ноябре', until: '2026-10-20' });
    expect(result.current.hasChanges).toBe(false);
  });
});

describe('useBoardNoticeForm — save()', () => {
  it('текст и срок уходят одним PATCH, пробелы по краям текста обрезаются', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_EMPTY, update));

    act(() => result.current.setText('  Ретрит в ноябре \n'));
    act(() => result.current.setUntil('2026-10-20'));
    expect(result.current.hasChanges).toBe(true);
    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      boardNotice: { text: 'Ретрит в ноябре', until: '2026-10-20' },
    });
  });

  it('только новый срок — тот же текст уходит вместе с ним', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_FILLED, update));

    act(() => result.current.setUntil('2026-10-25'));
    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({
      boardNotice: { text: 'Ретрит в ноябре', until: '2026-10-25' },
    });
  });

  it('текст без срока — ошибка формы «Укажите, до какого дня показывать», запроса нет', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_EMPTY, update));

    act(() => result.current.setText('Ретрит в ноябре'));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error?.message).toBe('Укажите, до какого дня показывать');
    expect(update).not.toHaveBeenCalled();
  });

  it('ошибка про срок гаснет, когда учитель его выбрал', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_EMPTY, update));
    act(() => result.current.setText('Ретрит в ноябре'));
    await act(async () => {
      await result.current.save();
    });

    act(() => result.current.setUntil('2026-10-20'));

    expect(result.current.error).toBeNull();
  });

  it('текст очищен — уходит null (сброс), срок в теле не нужен', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_FILLED, update));

    act(() => result.current.setText('   '));
    expect(result.current.hasChanges).toBe(true);
    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ boardNotice: null });
  });

  it('объявления нет, выбрана только дата — менять нечего, save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_EMPTY, update));

    act(() => result.current.setUntil('2026-10-20'));
    expect(result.current.hasChanges).toBe(false);
    await act(async () => {
      await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('без изменений — save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_FILLED, update));

    await act(async () => {
      await result.current.save();
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('ошибка сервера — в error с его текстом, набранное остаётся', async () => {
    const update = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Объявление на доске: слишком длинный текст.', 400, 'invalid_input'),
      );
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_EMPTY, update));

    act(() => result.current.setText('Ретрит в ноябре'));
    act(() => result.current.setUntil('2026-10-20'));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error?.message).toBe(
      'Объявление на доске: слишком длинный текст.',
    );
    expect(result.current.form.text).toBe('Ретрит в ноябре');
    expect(result.current.pending).toBe(false);
  });

  it('сбой не от сервера (сеть, таймаут) — общий текст с действием', async () => {
    const update = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useBoardNoticeForm(SETTINGS_EMPTY, update));

    act(() => result.current.setText('Ретрит в ноябре'));
    act(() => result.current.setUntil('2026-10-20'));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error?.message).toBe(
      'Не удалось сохранить объявление. Попробуйте ещё раз.',
    );
  });
});

describe('useBoardNoticeForm — синхронизация с сохранённым', () => {
  it('settings.updatedAt изменился (после «Сохранить») — поля берут сохранённое', () => {
    const { result, rerender } = renderHook(
      ({ settings }: { settings: SettingsDto | null }) =>
        useBoardNoticeForm(settings, vi.fn()),
      { initialProps: { settings: SETTINGS_EMPTY } },
    );

    rerender({ settings: SETTINGS_FILLED });

    expect(result.current.form).toEqual({ text: 'Ретрит в ноябре', until: '2026-10-20' });
  });
});
