// MemoryRouter — ConfirmDialog внутри карточки держит useHistorySheet
// (тот же приём, что PersonRow.test.tsx).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { InviteLinkCard } from './InviteLinkCard';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderCard() {
  return render(
    <MemoryRouter initialEntries={['/hub', '/people']} initialIndex={1}>
      <InviteLinkCard />
    </MemoryRouter>,
  );
}

describe('InviteLinkCard — объяснение видно всегда', () => {
  it('текст «Отправьте ссылку…» есть до любого действия', async () => {
    mockedApiFetch.mockResolvedValue({ url: null });
    renderCard();

    expect(
      await screen.findByText(/Отправьте ссылку ученику или опубликуйте в канале/),
    ).toBeInTheDocument();
  });
});

describe('InviteLinkCard — ссылки ещё нет', () => {
  it('кнопка «Создать ссылку» — POST создаёт и сразу показывает url', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method === 'POST')
        return Promise.resolve({ url: 'https://xuanxue.su/join/' + 'a'.repeat(32) });
      return Promise.resolve({ url: null });
    });
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Создать ссылку' }));

    expect(
      await screen.findByText('https://xuanxue.su/join/' + 'a'.repeat(32)),
    ).toBeInTheDocument();
  });
});

describe('InviteLinkCard — ссылка есть', () => {
  const URL = 'https://xuanxue.su/join/' + 'b'.repeat(32);

  function mockWithUrl(rotatedUrl?: string) {
    mockedApiFetch.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method === 'POST')
        return Promise.resolve({ url: rotatedUrl ?? 'https://xuanxue.su/join/new' });
      return Promise.resolve({ url: URL });
    });
  }

  it('ссылка текстом и кнопки «Скопировать»/«Создать новую»', async () => {
    mockWithUrl();
    renderCard();

    expect(await screen.findByText(URL)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скопировать' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать новую' })).toBeInTheDocument();
  });

  it('«Создать новую» → подтверждение → read-after-write: новый url на месте старого', async () => {
    const user = userEvent.setup();
    const NEW_URL = 'https://xuanxue.su/join/' + 'c'.repeat(32);
    mockWithUrl(NEW_URL);
    renderCard();
    await screen.findByText(URL);

    await user.click(screen.getByRole('button', { name: 'Создать новую' }));
    const dialog = await screen.findByRole('dialog', { name: 'Создать новую ссылку?' });
    expect(
      within(dialog).getByText('Прежняя ссылка перестанет работать. Создать новую?'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Создать новую' }));

    await waitFor(() => expect(screen.getByText(NEW_URL)).toBeInTheDocument());
    expect(screen.queryByText(URL)).not.toBeInTheDocument();
  });

  it('«Скопировать» — navigator.clipboard.writeText со ссылкой', async () => {
    const user = userEvent.setup();
    mockWithUrl();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderCard();
    await screen.findByText(URL);

    await user.click(screen.getByRole('button', { name: 'Скопировать' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
    expect(
      await screen.findByRole('button', { name: 'Скопировано' }),
    ).toBeInTheDocument();
  });

  it('«Скопировать» — оба способа скопировать отказали — честная ошибка', async () => {
    const user = userEvent.setup();
    mockWithUrl();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- сохраняем ссылку только для restore ниже, `this` нативному DOM-методу не нужен
    const originalExecCommand = document.execCommand;
    document.execCommand = vi.fn().mockReturnValue(false);
    renderCard();
    await screen.findByText(URL);

    await user.click(screen.getByRole('button', { name: 'Скопировать' }));

    expect(
      await screen.findByText(
        'Не удалось скопировать — выделите текст и скопируйте вручную.',
      ),
    ).toBeInTheDocument();
    document.execCommand = originalExecCommand;
  });
});

describe('InviteLinkCard — сбой загрузки', () => {
  it('LoadErrorBanner — «Попробовать ещё раз» повторяет запрос', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mockedApiFetch.mockImplementation(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ url: null });
    });
    renderCard();

    await screen.findByText(
      'Не удалось загрузить ссылку-приглашение. Попробуйте ещё раз.',
    );
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('button', { name: 'Создать ссылку' }),
    ).toBeInTheDocument();
  });
});
