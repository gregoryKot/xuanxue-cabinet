// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// notifications/NotificationPrefsSection.test.tsx: переключатель на «сыром»
// useSettings, без Router — компонент никуда не навигирует.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MATERIALS_PAID_ACCESS,
  DEFAULT_PREVIEW_MINUTES,
  type SettingsDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { MaterialsPaidAccessSection } from './MaterialsPaidAccessSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const TOGGLE_LABEL = 'Открывать материалы «после оплаты» только оплатившим';

function settings(overrides: Partial<SettingsDto> = {}): SettingsDto {
  return {
    templates: { lesson_link: '', recording: '' },
    tz: 'Asia/Jerusalem',
    previewMinutes: DEFAULT_PREVIEW_MINUTES,
    materialsPaidAccess: DEFAULT_MATERIALS_PAID_ACCESS,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('MaterialsPaidAccessSection — отражает сохранённое значение', () => {
  it('рубильник выключен — переключатель не отмечен, число из paidCount видно', async () => {
    mockApiByPath({ '/settings': settings() });

    render(<MaterialsPaidAccessSection paidCount={3} />);

    expect(await screen.findByLabelText(TOGGLE_LABEL)).not.toBeChecked();
    expect(screen.getByText(/Сейчас так помечено 3 материала\./)).toBeInTheDocument();
  });

  it('рубильник включён — переключатель отмечен', async () => {
    mockApiByPath({ '/settings': settings({ materialsPaidAccess: true }) });

    render(<MaterialsPaidAccessSection paidCount={null} />);

    expect(await screen.findByLabelText(TOGGLE_LABEL)).toBeChecked();
  });

  it('paidCount: 0 — честно про пустоту', async () => {
    mockApiByPath({ '/settings': settings() });

    render(<MaterialsPaidAccessSection paidCount={0} />);

    await screen.findByLabelText(TOGGLE_LABEL);
    expect(
      screen.getByText(/Сейчас так не помечен ни один материал\./),
    ).toBeInTheDocument();
  });

  it('paidCount: null (фильтр по виду) — без числа', async () => {
    mockApiByPath({ '/settings': settings() });

    render(<MaterialsPaidAccessSection paidCount={null} />);

    await screen.findByLabelText(TOGGLE_LABEL);
    expect(screen.queryByText(/Сейчас так/)).not.toBeInTheDocument();
  });

  it('сбой загрузки настроек — баннер с повтором', async () => {
    const { ApiError } = await import('../api/http');
    mockApiByPath({ '/settings': new ApiError('Сервис недоступен', 503, 'unknown') });

    render(<MaterialsPaidAccessSection paidCount={0} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
  });
});

describe('MaterialsPaidAccessSection — сохранение', () => {
  it('клик шлёт PATCH с новым значением', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValueOnce(settings());
    render(<MaterialsPaidAccessSection paidCount={0} />);
    const toggle = await screen.findByLabelText(TOGGLE_LABEL);

    // Один ответ на одно действие: PATCH /settings возвращает полный
    // SettingsDto, и рубильник берёт значение прямо из него (ADR-0087).
    // Прежняя заглушка `{}` на сам PATCH теперь уронила бы значение в
    // undefined — переключатель стал бы неуправляемым.
    mockedApiFetch.mockResolvedValueOnce(settings({ materialsPaidAccess: true }));
    await user.click(toggle);

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/settings',
        expect.objectContaining({
          method: 'PATCH',
          body: { materialsPaidAccess: true },
        }),
      ),
    );
    expect(await screen.findByLabelText(TOGGLE_LABEL)).toBeChecked();
  });

  it('ошибка сохранения — видна на экране, не молча', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockResolvedValueOnce(settings());
    render(<MaterialsPaidAccessSection paidCount={0} />);
    const toggle = await screen.findByLabelText(TOGGLE_LABEL);

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );
    await user.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
  });
});
