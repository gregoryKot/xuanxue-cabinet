// Сборка экрана /attempts/:id — выбор состояния по ответу GET /attempts
// (своего GET /attempts/:id у API нет, useAttempt.ts берёт список и находит
// по id). Форма ответа и «Отправлено» — свои тесты в AttemptInProgress.test.tsx
// и AttemptSubmitted.test.tsx, здесь только маршрутизация между ними.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import AttemptScreen from './AttemptScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function renderAt(attemptId: string) {
  return render(
    <MemoryRouter initialEntries={[`/attempts/${attemptId}`]}>
      <Routes>
        <Route path="/attempts/:id" element={<AttemptScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

const IN_PROGRESS: ExamAttemptDto = {
  id: 'a1',
  examId: 'e1',
  examTitle: 'Форма первого уровня',
  userId: 'u1',
  status: 'in_progress',
  blocks: [],
  answers: [],
  startedAt: '2026-09-01T00:00:00Z',
  expired: false,
};

describe('AttemptScreen', () => {
  it('в работе — рисует форму сдачи с названием экзамена', async () => {
    mockedApiFetch.mockResolvedValueOnce([IN_PROGRESS]);
    renderAt('a1');

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument();
  });

  it('уже отправлена — экран «Отправлено», без формы', async () => {
    mockedApiFetch.mockResolvedValueOnce([{ ...IN_PROGRESS, status: 'submitted' }]);
    renderAt('a1');

    expect(
      await screen.findByText('Отправлено. Учитель проверит и пришлёт результат.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отправить' })).not.toBeInTheDocument();
  });

  it('сбой сети — баннер с повтором', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Нет связи с сервером.', 0, 'network'),
    );
    renderAt('a1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером.');
  });

  it('после сбоя «Повторить» перечитывает попытку и открывает форму', async () => {
    mockedApiFetch
      .mockRejectedValueOnce(new ApiError('Нет связи с сервером.', 0, 'network'))
      .mockResolvedValueOnce([IN_PROGRESS]);
    renderAt('a1');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
  });

  // Маршрут без :id руками не собрать, но React Router может отдать undefined —
  // экран не должен падать, а должен честно сказать, что попытки нет.
  it('без идентификатора в адресе — «попытка не найдена», без падения', async () => {
    mockedApiFetch.mockResolvedValueOnce([IN_PROGRESS]);
    render(
      <MemoryRouter initialEntries={['/attempts']}>
        <Routes>
          <Route path="/attempts" element={<AttemptScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Попытка не найдена. Обновите страницу.',
    );
  });

  it('такой попытки нет в списке своих — текст «попытка не найдена»', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    renderAt('чужая-или-неизвестная');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Попытка не найдена. Обновите страницу.',
    );
  });
});
