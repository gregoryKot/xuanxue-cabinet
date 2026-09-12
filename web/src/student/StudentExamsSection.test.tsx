// Раздел «Экзамены» на экране ученика — загрузка списка, старт попытки и
// переход на экран сдачи (ТЗ п.1). Навигацию проверяем через настоящий
// react-router (MemoryRouter + Routes), как App.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, MyExamDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { StudentExamsSection } from './StudentExamsSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const EXAM: MyExamDto = {
  id: 'e1',
  title: 'Форма первого уровня',
  description: '',
  level: '',
  attemptsAllowed: 1,
  attemptsUsed: 0,
};

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<StudentExamsSection />} />
        <Route path="/attempts/:id" element={<p>Экран сдачи</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StudentExamsSection', () => {
  it('экзаменов нет — человеческая фраза', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    renderSection();

    expect(await screen.findByText('Экзаменов пока нет.')).toBeInTheDocument();
  });

  it('сбой загрузки — баннер с повтором', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Нет связи с сервером.', 0, 'network'),
    );
    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером.');
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument();
  });

  it('«Начать» — стартует попытку и уводит на экран сдачи', async () => {
    mockedApiFetch.mockResolvedValueOnce([EXAM]);
    const attempt: Partial<ExamAttemptDto> = { id: 'attempt-1' };
    mockedApiFetch.mockResolvedValueOnce(attempt);
    renderSection();

    const button = await screen.findByRole('button', { name: 'Начать' });
    button.click();

    expect(await screen.findByText('Экран сдачи')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/exams/e1/attempts', { method: 'POST' });
  });

  it('сбой старта попытки — ошибка у карточки, экран сдачи не открывается', async () => {
    mockedApiFetch.mockResolvedValueOnce([EXAM]);
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Этот экзамен ещё не открыт для сдачи.', 400, 'invalid_input'),
    );
    renderSection();

    const button = await screen.findByRole('button', { name: 'Начать' });
    button.click();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Этот экзамен ещё не открыт для сдачи.',
    );
    expect(screen.queryByText('Экран сдачи')).not.toBeInTheDocument();
    await waitFor(() => expect(button).toBeEnabled());
  });
});
