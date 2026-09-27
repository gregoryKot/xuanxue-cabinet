// Флоу массового удаления (ADR-0141) — отдельный файл от ExamsScreen.test.tsx,
// который уже занял тот же mockApiByPath, но не трогает bulk-delete: держим
// новый флоу отдельно, чтобы не раздувать существующий файл (CLAUDE.md
// «Храповики», предел строк). '/exams?' (список) и '/exams/bulk-delete'
// (запись) — непересекающиеся префиксы mockApiByPath, порядок в объекте
// не важен. Экран заодно грузит /attempts (очередь проверки),
// /exam-items/stats-summary, /exam-images/stats-summary, /exam-videos/stats-summary,
// /grading-presets — без ответа на них mockApiByPath бросает «неожиданный путь».
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import ExamsScreen from './ExamsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeExam(overrides: Partial<ExamDto> = {}): ExamDto {
  return {
    id: 'x1',
    title: 'Итоговый экзамен',
    description: '',
    level: '',
    blocks: [],
    shuffleOptions: false,
    attemptsAllowed: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const DEFAULT_SUMMARIES = {
  '/exam-items/stats-summary': { strugglingCount: 0 },
  '/exam-images/stats-summary': { count: 0, totalBytes: 0 },
  '/exam-videos/stats-summary': { count: 0, totalBytes: 0 },
  '/grading-presets': [],
  '/attempts': [],
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/exams']}>
      <Routes>
        <Route path="/exams" element={<ExamsScreen />} />
        <Route path="/exams/:examId" element={<p>Открыт экзамен</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ExamsScreen — выбрать → удалить (ADR-0141)', () => {
  it('POST на bulk-delete с отмеченными id, удалённый экзамен пропадает, отказавший остаётся с причиной', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      ...DEFAULT_SUMMARIES,
      '/exams/bulk-delete': {
        deletedIds: ['x1'],
        failed: [{ id: 'x2', message: 'Экзамен не найден. Обновите список.' }],
      },
      '/exams?': [
        makeExam({ id: 'x1', title: 'Итоговый экзамен' }),
        makeExam({ id: 'x2', title: 'Промежуточный экзамен' }),
      ],
    });

    renderScreen();
    await screen.findByText('Итоговый экзамен');

    await user.click(screen.getByRole('button', { name: 'Выбрать' }));
    await user.click(screen.getByRole('checkbox', { name: /Итоговый экзамен/ }));
    await user.click(screen.getByRole('checkbox', { name: /Промежуточный экзамен/ }));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить 2 экзамена?' });
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/exams/bulk-delete',
        expect.objectContaining({ method: 'POST', body: { ids: ['x1', 'x2'] } }),
      ),
    );

    expect(screen.queryByText('Итоговый экзамен')).not.toBeInTheDocument();
    expect(screen.getByText('Промежуточный экзамен')).toBeInTheDocument();
    expect(screen.getByText('Экзамен не найден. Обновите список.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Удалили 1 экзамен');

    const listCalls = mockedApiFetch.mock.calls.filter((call) =>
      call[0].startsWith('/exams?'),
    );
    expect(listCalls).toHaveLength(1);
  });
});
