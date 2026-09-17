import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import GradingQueueScreen from './GradingQueueScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

// Учитель со связанным Telegram и активным личным чатом — по умолчанию
// подсказка связки (ADR-0042) молчит, тестам списка/загрузки она не мешает;
// у своих тестов ниже («подсказка про Telegram») своё значение botChatActive.
const TEACHER: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: true,
  botChatActive: true,
};
const ADMIN: MeDto = {
  id: 'a1',
  name: 'Маша',
  roles: ['admin'],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: true,
  botChatActive: false,
};

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    userName: 'Иван Иванов',
    status: 'submitted',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    submittedAt: '2026-09-01T01:00:00Z',
    expired: false,
    ...overrides,
  };
}

/** Экран параллельно зовёт /attempts и (через AuthProvider) /auth/me,
 * /auth/config — мок по пути, не очередь `mockResolvedValueOnce` (см.
 * test-support/apiFetchMock.ts). `me` по умолчанию — учитель с активным
 * чатом, подсказке ADR-0042 тут гореть незачем. */
function renderScreen(attempts: unknown, me: MeDto = TEACHER) {
  mockApiByPath({
    '/auth/me': me,
    '/auth/config': {},
    '/attempts': attempts,
  });

  return render(
    <MemoryRouter initialEntries={['/grading']}>
      <AuthProvider>
        <Routes>
          <Route path="/grading" element={<GradingQueueScreen />} />
          <Route path="/grading/:attemptId" element={<p>Карточка проверки открыта</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('GradingQueueScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    const { container } = renderScreen(new Promise(() => {}));

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('GradingQueueScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и кнопка повтора, клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');

    renderScreen(new ApiError('Сервис недоступен', 503, 'unknown'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    const retry = screen.getByRole('button', { name: 'Попробовать ещё раз' });

    mockApiByPath({ '/attempts': [makeAttempt()] });
    await user.click(retry);

    expect(await screen.findByText('Иван Иванов')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('GradingQueueScreen — пустая база', () => {
  it('честный текст, не «0 работ»', async () => {
    renderScreen([]);

    expect(
      await screen.findByText('Пока нечего проверять — сданных работ нет.'),
    ).toBeInTheDocument();
  });
});

describe('GradingQueueScreen — список', () => {
  it('карточка показывает ученика, экзамен и когда сдана', async () => {
    renderScreen([makeAttempt()]);

    expect(await screen.findByText('Иван Иванов')).toBeInTheDocument();
    expect(screen.getByText(/Форма первого уровня/)).toBeInTheDocument();
  });

  it('сдано по времени — на карточке видна пометка', async () => {
    renderScreen([makeAttempt({ expired: true })]);

    expect(await screen.findByText(/сдано по времени/)).toBeInTheDocument();
  });

  it('клик по карточке открывает проверку конкретной попытки', async () => {
    const user = userEvent.setup();
    renderScreen([makeAttempt()]);
    await user.click(await screen.findByText('Иван Иванов'));

    expect(await screen.findByText('Карточка проверки открыта')).toBeInTheDocument();
  });
});

describe('GradingQueueScreen — подсказка про Telegram (ADR-0042)', () => {
  it('учитель без активного чата с ботом — подсказка и кнопка «Связать Telegram»', async () => {
    renderScreen([], { ...TEACHER, botChatActive: false });

    await screen.findByText('Пока нечего проверять — сданных работ нет.');
    expect(
      screen.getByText(/Бот пишет о сданных работах в личный чат/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Связать Telegram' })).toBeInTheDocument();
  });

  it('учитель с активным чатом — подсказки и кнопки нет', async () => {
    renderScreen([], TEACHER);

    await screen.findByText('Пока нечего проверять — сданных работ нет.');
    expect(
      screen.queryByText(/Бот пишет о сданных работах в личный чат/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });

  it('админ без чата — подсказки и кнопки нет: он не проверяет работы', async () => {
    renderScreen([], ADMIN);

    await screen.findByText('Пока нечего проверять — сданных работ нет.');
    expect(
      screen.queryByText(/Бот пишет о сданных работах в личный чат/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });
});
