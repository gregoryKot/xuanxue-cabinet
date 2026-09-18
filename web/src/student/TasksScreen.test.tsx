// Экран «Задания» — рубрики новых/остальных заданий, старт попытки и переход
// на экран сдачи (решение владельца: экзамены — отдельный экран, первый
// после входа). Навигацию проверяем через настоящий react-router
// (MemoryRouter + Routes), как раньше StudentExamsSection.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, MyExamDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import TasksScreen from './TasksScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма первого уровня',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<TasksScreen />} />
        <Route path="/attempts/:id" element={<p>Экран сдачи</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TasksScreen — заголовок раздела', () => {
  it('заголовок и объяснение — как у остальных разделов кабинета', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    renderScreen();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Задания' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Экзамены, которые открыл учитель. Каждый — с числом попыток и итогом проверки.'),
    ).toBeInTheDocument();
  });
});

describe('TasksScreen — пусто', () => {
  it('заданий нет совсем — честная фраза, не «0»', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    renderScreen();

    expect(await screen.findByText('Заданий пока нет.')).toBeInTheDocument();
  });
});

describe('TasksScreen — рубрики новых заданий', () => {
  it('одно новое — рубрика в единственном числе, «Остальных» нет', async () => {
    mockedApiFetch.mockResolvedValueOnce([makeExam({ id: 'e1' })]);
    renderScreen();

    expect(await screen.findByText('Новое задание')).toBeInTheDocument();
    expect(screen.queryByText('Новые задания')).not.toBeInTheDocument();
    expect(screen.queryByText('Остальные')).not.toBeInTheDocument();
  });

  it('несколько новых — рубрика во множественном числе', async () => {
    mockedApiFetch.mockResolvedValueOnce([
      makeExam({ id: 'e1' }),
      makeExam({ id: 'e2', title: 'Форма второго уровня' }),
    ]);
    renderScreen();

    expect(await screen.findByText('Новые задания')).toBeInTheDocument();
    expect(screen.queryByText('Новое задание')).not.toBeInTheDocument();
  });

  it('новых нет — рубрики нет вовсе, список идёт без заголовков', async () => {
    mockedApiFetch.mockResolvedValueOnce([
      makeExam({
        id: 'e1',
        attemptsAllowed: 2,
        lastAttempt: { id: 'a1', status: 'submitted' },
      }),
    ]);
    renderScreen();

    await screen.findByText('Форма первого уровня');
    expect(screen.queryByText('Новое задание')).not.toBeInTheDocument();
    expect(screen.queryByText('Новые задания')).not.toBeInTheDocument();
    expect(screen.queryByText('Остальные')).not.toBeInTheDocument();
  });

  it('новое и старое вместе — новое сверху под своей рубрикой, старое — под «Остальные»', async () => {
    mockedApiFetch.mockResolvedValueOnce([
      makeExam({
        id: 'e1',
        title: 'Уже отвечал',
        attemptsAllowed: 2,
        lastAttempt: { id: 'a1', status: 'submitted' },
      }),
      makeExam({ id: 'e2', title: 'Ещё не начинал' }),
    ]);
    renderScreen();

    expect(await screen.findByText('Новое задание')).toBeInTheDocument();
    expect(screen.getByText('Остальные')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Новое задание', 'Остальные']);
  });
});

describe('TasksScreen — старт попытки', () => {
  it('«Начать» — стартует попытку и уводит на экран сдачи', async () => {
    mockedApiFetch.mockResolvedValueOnce([makeExam()]);
    const attempt: Partial<ExamAttemptDto> = { id: 'attempt-1' };
    mockedApiFetch.mockResolvedValueOnce(attempt);
    renderScreen();

    const button = await screen.findByRole('button', { name: 'Начать' });
    button.click();

    expect(await screen.findByText('Экран сдачи')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/exams/e1/attempts', { method: 'POST' });
  });

  it('сбой старта попытки — ошибка у своей карточки, экран сдачи не открывается', async () => {
    mockedApiFetch.mockResolvedValueOnce([makeExam()]);
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Этот экзамен ещё не открыт для сдачи.', 400, 'invalid_input'),
    );
    renderScreen();

    const button = await screen.findByRole('button', { name: 'Начать' });
    button.click();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Этот экзамен ещё не открыт для сдачи.',
    );
    expect(screen.queryByText('Экран сдачи')).not.toBeInTheDocument();
    await waitFor(() => expect(button).toBeEnabled());
  });
});
