// Флоу массового удаления (ADR-0141) — отдельный файл от ExamItemsScreen.test.tsx
// (тот уже занял ручной vi.fn() без mockApiByPath, менять его ради одного
// флоу — не тема этого PR). Сеть — mockApiByPath (test-support/apiFetchMock.ts,
// ответ по префиксу пути), без новых mockResolvedValueOnce/mockRejectedValueOnce
// (check-once-mock-ratchet.mjs): '/exam-items?' (список) и
// '/exam-items/bulk-delete' (запись) — непересекающиеся префиксы, порядок
// регистрации в объекте роли не играет.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import ExamItemsScreen from './ExamItemsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'e1',
    kind: 'text',
    prompt: 'Первый вопрос',
    options: [],
    status: 'draft',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/exam-items']}>
      <Routes>
        <Route path="/exam-items" element={<ExamItemsScreen />} />
        <Route path="/exam-items/:itemId" element={<p>Здесь страница вопроса</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ExamItemsScreen — выбрать → удалить (ADR-0141)', () => {
  it('POST на bulk-delete с отмеченными id, удалённая строка пропадает, отказавшая остаётся с причиной', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/exam-items/bulk-delete': {
        deletedIds: ['e1'],
        failed: [{ id: 'e2', message: 'Вопрос не найден. Обновите список.' }],
      },
      '/exam-items?': [
        makeItem({ id: 'e1', prompt: 'Первый вопрос' }),
        makeItem({ id: 'e2', prompt: 'Второй вопрос' }),
      ],
    });

    renderScreen();
    await screen.findByText('Первый вопрос');

    await user.click(screen.getByRole('button', { name: 'Выбрать' }));
    await user.click(screen.getByRole('checkbox', { name: /Первый вопрос/ }));
    await user.click(screen.getByRole('checkbox', { name: /Второй вопрос/ }));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить 2 вопроса?' });
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/exam-items/bulk-delete',
        expect.objectContaining({ method: 'POST', body: { ids: ['e1', 'e2'] } }),
      ),
    );

    // Удалённый вопрос пропал из списка, отказавший остался — с причиной.
    expect(screen.queryByText('Первый вопрос')).not.toBeInTheDocument();
    expect(screen.getByText('Второй вопрос')).toBeInTheDocument();
    expect(screen.getByText('Вопрос не найден. Обновите список.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Удалили 1 вопрос');

    // Список не перечитан вторым GET (ADR-0087) — запрос был только один раз
    // на список и один раз на bulk-delete.
    const listCalls = mockedApiFetch.mock.calls.filter((call) =>
      call[0].startsWith('/exam-items?'),
    );
    expect(listCalls).toHaveLength(1);
  });
});
