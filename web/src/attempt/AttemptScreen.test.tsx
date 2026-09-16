// Сборка экрана /attempts/:id — выбор состояния по ответу GET /attempts
// (своего GET /attempts/:id у API нет, useAttempt.ts берёт список и находит
// по id). Форма ответа и «Отправлено» — свои тесты в AttemptInProgress.test.tsx
// и AttemptSubmitted.test.tsx, здесь только маршрутизация между ними.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import AttemptScreen from './AttemptScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const STUDENT_WITH_TELEGRAM: MeDto = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: true,
};

/** Экран параллельно зовёт /attempts, /auth/me и /auth/config, поэтому мок —
 * по пути, а не очередью `mockResolvedValueOnce`: очередь отдала бы ответ
 * тому, кто успел первым, и тест держался бы на порядке эффектов. */
function mockPaths(attempts: unknown, me: MeDto = STUDENT_WITH_TELEGRAM) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === '/auth/config')
      return Promise.resolve({ telegramBotUsername: 'xx_bot' });
    if (path.startsWith('/attempts')) {
      return attempts instanceof Error
        ? Promise.reject(attempts)
        : Promise.resolve(attempts);
    }
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
}

function renderAt(attemptId: string) {
  return render(
    <MemoryRouter initialEntries={[`/attempts/${attemptId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/attempts/:id" element={<AttemptScreen />} />
        </Routes>
      </AuthProvider>
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
    mockPaths([IN_PROGRESS]);
    renderAt('a1');

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument();
  });

  it('уже отправлена — экран «Отправлено», без формы', async () => {
    mockPaths([{ ...IN_PROGRESS, status: 'submitted' }]);
    renderAt('a1');

    expect(
      await screen.findByText('Отправлено. Учитель проверит и пришлёт результат.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отправить' })).not.toBeInTheDocument();
  });

  // Инцидент 2026-09-16 (RUNBOOK §8.17): вошедший по почте видел кнопку
  // «Отправить видео боту», шёл по ней и получал от бота отказ.
  it('Telegram не привязан — на «Отправлено» кнопки бота нет, есть форма ссылки', async () => {
    mockPaths([{ ...IN_PROGRESS, status: 'submitted' }], {
      ...STUDENT_WITH_TELEGRAM,
      telegramLinked: false,
    });
    renderAt('a1');

    expect(await screen.findByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Отправить видео боту/ }),
    ).not.toBeInTheDocument();
  });

  it('Telegram привязан — на «Отправлено» есть кнопка бота', async () => {
    mockPaths([{ ...IN_PROGRESS, status: 'submitted' }]);
    renderAt('a1');

    expect(
      await screen.findByRole('link', { name: 'Отправить видео боту в Telegram' }),
    ).toBeInTheDocument();
  });

  it('сбой сети — баннер с повтором', async () => {
    mockPaths(new ApiError('Нет связи с сервером.', 0, 'network'));
    renderAt('a1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером.');
  });

  it('после сбоя «Повторить» перечитывает попытку и открывает форму', async () => {
    let attemptsCallCount = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/attempts')) {
        attemptsCallCount += 1;
        return attemptsCallCount === 1
          ? Promise.reject(new ApiError('Нет связи с сервером.', 0, 'network'))
          : Promise.resolve([IN_PROGRESS]);
      }
      return Promise.resolve({});
    });
    renderAt('a1');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
  });

  // Маршрут без :id руками не собрать, но React Router может отдать undefined —
  // экран не должен падать, а должен честно сказать, что попытки нет.
  it('без идентификатора в адресе — «попытка не найдена», без падения', async () => {
    mockPaths([IN_PROGRESS]);
    render(
      <MemoryRouter initialEntries={['/attempts']}>
        <AuthProvider>
          <Routes>
            <Route path="/attempts" element={<AttemptScreen />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Попытка не найдена. Обновите страницу.',
    );
  });

  it('такой попытки нет в списке своих — текст «попытка не найдена»', async () => {
    mockPaths([]);
    renderAt('чужая-или-неизвестная');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Попытка не найдена. Обновите страницу.',
    );
  });
});
