// «Выгрузить данные» (ADR-0160): диалог объясняет, зачем файл и кому его
// отдавать, скачивание идёт только после подтверждения, имя файла — дата и
// хвост id без имени человека. Сеть — mockApiByPath (не очередь `…Once`),
// сама загрузка файла в браузере — подмена Blob-ссылки и клика по <a>.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserDataExportDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { PersonExportButton } from './PersonExportButton';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const PERSON_ID = '65f0c0ffee00000000abc123';

const EXPORT: UserDataExportDto = {
  exportedAt: '2026-09-30T10:00:00.000Z',
  note: 'Здесь всё, что кабинет школы хранит об этом человеке.',
  sections: [
    {
      key: 'UserRecord',
      title: 'Аккаунт',
      retention: 'Пока существует аккаунт',
      records: [{ id: PERSON_ID, name: 'Анна', email: 'anna@example.com' }],
    },
  ],
  references: [],
};

function renderButton() {
  render(
    <MemoryRouter initialEntries={['/hub', '/people']} initialIndex={1}>
      <PersonExportButton personId={PERSON_ID} />
    </MemoryRouter>,
  );
}

describe('PersonExportButton', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:export');
  let downloadedAs: string | null = null;

  beforeEach(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedAs = this.download;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    createObjectURL.mockClear();
    downloadedAs = null;
  });

  it('до подтверждения ничего не скачивает и не ходит в сеть', async () => {
    mockApiByPath({ [`/users/${PERSON_ID}/export`]: EXPORT });
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Выгрузить данные' }));

    expect(screen.getByText('Выгрузить данные?')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(downloadedAs).toBeNull();
  });

  it('диалог называет срок в 30 дней и просит отдать файл самому человеку', async () => {
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Выгрузить данные' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('за 30 дней');
    expect(dialog).toHaveTextContent('самому человеку, не в общий чат');
  });

  it('«Скачать файл»: запрос выгрузки, JSON в файле, имя без имени человека', async () => {
    mockApiByPath({ [`/users/${PERSON_ID}/export`]: EXPORT });
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Выгрузить данные' }));

    await userEvent.click(screen.getByRole('button', { name: 'Скачать файл' }));

    await waitFor(() => expect(downloadedAs).toBe('xuanxue-data-2026-09-30-abc123.json'));
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(JSON.parse((await blob?.text()) ?? '')).toEqual(EXPORT);
    expect(downloadedAs).not.toContain('Анна');
  });

  it('«Отмена» закрывает диалог: сеть не тронута, файла нет', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Выгрузить данные' }));

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(downloadedAs).toBeNull();
  });

  it('сбой сервера: текст ошибки остаётся на экране, файла нет', async () => {
    mockApiByPath({
      [`/users/${PERSON_ID}/export`]: new ApiError(
        'Пользователь не найден. Обновите список.',
        404,
        'not_found',
      ),
    });
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Выгрузить данные' }));

    await userEvent.click(screen.getByRole('button', { name: 'Скачать файл' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Пользователь не найден. Обновите список.',
    );
    expect(downloadedAs).toBeNull();
  });

  it('сбой сети без тела ответа: общий текст с действием', async () => {
    mockApiByPath({ [`/users/${PERSON_ID}/export`]: new Error('offline') });
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Выгрузить данные' }));

    await userEvent.click(screen.getByRole('button', { name: 'Скачать файл' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выгрузить данные. Попробуйте ещё раз.',
    );
  });
});
