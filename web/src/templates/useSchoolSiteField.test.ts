import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MATERIALS_PAID_ACCESS,
  DEFAULT_PREVIEW_MINUTES,
  type SettingsDto,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useSchoolSiteField } from './useSchoolSiteField';

const SETTINGS_WITH_SITE: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  schoolSiteUrl: 'https://xuanxue.su',
  previewMinutes: DEFAULT_PREVIEW_MINUTES,
  materialsPaidAccess: DEFAULT_MATERIALS_PAID_ACCESS,
  // Другой updatedAt, чем у SETTINGS_WITHOUT_SITE — синхронизация в хуке
  // идёт по нему (как texts в TemplatesScreen.tsx), одинаковый updatedAt у
  // обоих фикстур не запустил бы эффект заново.
  updatedAt: '2026-09-06T18:05:00.000Z',
};

const SETTINGS_WITHOUT_SITE: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: DEFAULT_PREVIEW_MINUTES,
  materialsPaidAccess: DEFAULT_MATERIALS_PAID_ACCESS,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

describe('useSchoolSiteField — начальное значение', () => {
  it('settings ещё не загружены (null) — пустое поле, без изменений', () => {
    const { result } = renderHook(() => useSchoolSiteField(null, vi.fn()));

    expect(result.current.value).toBe('');
    expect(result.current.hasChanges).toBe(false);
  });

  it('адрес уже сохранён — поле показывает его', () => {
    const { result } = renderHook(() => useSchoolSiteField(SETTINGS_WITH_SITE, vi.fn()));

    expect(result.current.value).toBe('https://xuanxue.su');
    expect(result.current.hasChanges).toBe(false);
  });
});

describe('useSchoolSiteField — save()', () => {
  it('новый адрес — save() шлёт { schoolSiteUrl } без пробелов по краям', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useSchoolSiteField(SETTINGS_WITHOUT_SITE, update),
    );

    act(() => result.current.setValue('  https://xuanxue.su  '));
    expect(result.current.hasChanges).toBe(true);

    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ schoolSiteUrl: 'https://xuanxue.su' });
    expect(result.current.pending).toBe(false);
  });

  it('поле очищено — save() шлёт schoolSiteUrl: null (снятие настройки)', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSchoolSiteField(SETTINGS_WITH_SITE, update));

    act(() => result.current.setValue('   '));

    await act(async () => {
      await result.current.save();
    });

    expect(update).toHaveBeenCalledWith({ schoolSiteUrl: null });
  });

  it('без изменений — save() не зовёт update()', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSchoolSiteField(SETTINGS_WITH_SITE, update));

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
          'Адрес сайта школы: должна начинаться с https://.',
          400,
          'invalid_input',
        ),
      );
    const { result } = renderHook(() =>
      useSchoolSiteField(SETTINGS_WITHOUT_SITE, update),
    );

    act(() => result.current.setValue('http://xuanxue.su'));
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error?.message).toBe(
      'Адрес сайта школы: должна начинаться с https://.',
    );
    expect(result.current.pending).toBe(false);
  });
});

describe('useSchoolSiteField — синхронизация с сохранённым', () => {
  it('settings.updatedAt изменился (после успешного «Сохранить») — поле обновляется', () => {
    const { result, rerender } = renderHook(
      ({ settings }: { settings: SettingsDto | null }) =>
        useSchoolSiteField(settings, vi.fn()),
      { initialProps: { settings: SETTINGS_WITHOUT_SITE } },
    );

    rerender({ settings: SETTINGS_WITH_SITE });

    expect(result.current.value).toBe('https://xuanxue.su');
  });
});
