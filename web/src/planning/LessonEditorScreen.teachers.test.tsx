// Сбой GET /users/teachers на странице занятия (аудит В4) — отдельный файл,
// чтобы не толкать LessonEditorScreen.test.tsx за 300 строк (CLAUDE.md
// «Файлы»). Список учителей грузит сама страница (LessonEditorForm.tsx):
// его сбой форму не прячет, над select'ом «Ведущий» встаёт строка с повтором.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ClassDto, LessonDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import LessonEditorScreen from './LessonEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const TEACHERS_ERROR = 'Не удалось загрузить список учителей. Попробуйте ещё раз.';

const CLASS: ClassDto = {
  id: 'c1',
  title: 'Тайцзицюань, средняя группа',
  groupLabel: '',
  format: 'online',
  rules: [],
  tz: 'Asia/Jerusalem',
  channelIds: [],
  leadMinutes: 30,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const LESSON: LessonDto = {
  id: 'l1',
  classId: 'c1',
  startsAt: '2026-09-08T16:00:00.000Z',
  durationMin: 60,
  topic: 'Пятое занятие цикла',
  status: 'scheduled',
  tags: [],
  recordings: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/planning/l1']}>
      <Routes>
        <Route path="/planning/:lessonId" element={<LessonEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LessonEditorScreen — сбой загрузки учителей (аудит В4)', () => {
  it('форма остаётся, у списка учителей — строка с ошибкой и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/lessons/l1': LESSON,
      '/materials': [],
      '/classes': [CLASS],
      '/users/teachers': new ApiError(TEACHERS_ERROR, 503, 'unknown'),
    });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent(TEACHERS_ERROR);
    expect(screen.getByLabelText('Ведущий')).toBeInTheDocument();
    expect(screen.getByLabelText('Тема')).toHaveValue('Пятое занятие цикла');

    mockApiByPath({
      '/lessons/l1': LESSON,
      '/materials': [],
      '/classes': [CLASS],
      '/users/teachers': [{ id: 't1', name: 'Дмитрий' }],
    });
    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Дмитрий' })).toBeInTheDocument();
  });

  it('сбой расписания страницу не закрывает — занятие правится дальше', async () => {
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/lessons/l1': LESSON,
      '/materials': [],
      '/classes': new ApiError('Не удалось загрузить расписание.', 503, 'unknown'),
      '/users/teachers': [],
    });

    renderScreen();

    expect(await screen.findByLabelText('Тема')).toHaveValue('Пятое занятие цикла');
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('/classes'),
      expect.anything(),
    );
  });
});
