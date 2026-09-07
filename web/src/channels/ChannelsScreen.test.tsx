// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// planning/PlanningScreen.test.tsx.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import ChannelsScreen from './ChannelsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '777',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <ChannelsScreen />
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('ChannelsScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('ChannelsScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Попробовать ещё раз», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockedApiFetch.mockResolvedValueOnce([]);
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText(/Пока нет ни одного канала/)).toBeInTheDocument();
  });
});

describe('ChannelsScreen — пустая база', () => {
  it('объясняющий текст остаётся, честное пустое состояние', async () => {
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();

    expect(await screen.findByText(/Пока нет ни одного канала/)).toBeInTheDocument();
    expect(screen.getByText(/Telegram-группа подключается сама/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить канал' })).toBeInTheDocument();
  });
});

describe('ChannelsScreen — список каналов', () => {
  it('карточка канала, открывает лист по клику', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeChannel()]);

    renderScreen();

    const card = await screen.findByText('ВК · ВК школы');
    await user.click(card);

    expect(await screen.findByRole('heading', { name: 'Канал' })).toBeInTheDocument();
  });

  it('переключатель на карточке шлёт PATCH active', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeChannel({ active: true })]);

    renderScreen();
    await screen.findByText('ВК · ВК школы');

    mockedApiFetch.mockResolvedValueOnce(makeChannel({ active: false }));
    mockedApiFetch.mockResolvedValueOnce([makeChannel({ active: false })]);
    await user.click(screen.getByLabelText('Включён — ВК школы'));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/channels/ch1',
        expect.objectContaining({ method: 'PATCH', body: { active: false } }),
      ),
    );
  });

  it('переключение канала не показывает скелетон повторно, список остаётся видимым (ревью п.10)', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeChannel({ active: true })]);

    renderScreen();
    await screen.findByText('ВК · ВК школы');

    let resolvePatch: (value: ChannelDto) => void = () => {};
    mockedApiFetch.mockImplementationOnce(
      () =>
        new Promise<ChannelDto>((resolve) => {
          resolvePatch = resolve;
        }),
    );
    await user.click(screen.getByLabelText('Включён — ВК школы'));

    // Пока PATCH не завершился (список перечитывается заново) — карточка и
    // название канала остаются на экране, скелетона нет.
    expect(screen.getByText('ВК · ВК школы')).toBeInTheDocument();
    expect(document.querySelectorAll('[aria-hidden="true"]').length).toBe(0);

    resolvePatch(makeChannel({ active: false }));
    mockedApiFetch.mockResolvedValueOnce([makeChannel({ active: false })]);
    await waitFor(() =>
      expect(screen.getByLabelText('Включён — ВК школы')).not.toBeChecked(),
    );
  });

  it('«Добавить канал» открывает пустой лист, сохранение шлёт POST с телом manual-канала (ревью п.17)', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Добавить канал' }));

    const dialogTitle = await screen.findByRole('heading', { name: 'Новый канал' });
    const sheet = dialogTitle.closest('form') as HTMLFormElement;
    await user.type(within(sheet).getByLabelText('Название'), 'Facebook школы');
    await user.selectOptions(within(sheet).getByLabelText('Тип канала'), 'manual');

    mockedApiFetch.mockResolvedValueOnce(makeChannel());
    mockedApiFetch.mockResolvedValueOnce([]);
    await user.click(within(sheet).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/channels',
        expect.objectContaining({
          method: 'POST',
          body: { type: 'manual', title: 'Facebook школы', config: {} },
        }),
      ),
    );
  });

  it('включение выключенного канала — PATCH active: true (ревью п.17)', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeChannel({ active: false })]);

    renderScreen();
    await screen.findByText('ВК · ВК школы');

    mockedApiFetch.mockResolvedValueOnce(makeChannel({ active: true }));
    mockedApiFetch.mockResolvedValueOnce([makeChannel({ active: true })]);
    await user.click(screen.getByLabelText('Включён — ВК школы'));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/channels/ch1',
        expect.objectContaining({ method: 'PATCH', body: { active: true } }),
      ),
    );
  });
});
