import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import GradingQueueScreen from './GradingQueueScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

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

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/grading']}>
      <Routes>
        <Route path="/grading" element={<GradingQueueScreen />} />
        <Route path="/grading/:attemptId" element={<p>Карточка проверки открыта</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GradingQueueScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    mockApiByPath({ '/attempts': new Promise(() => {}) });

    const { container } = renderScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('GradingQueueScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и кнопка повтора, клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    renderScreen();

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
    mockApiByPath({ '/attempts': [] });

    renderScreen();

    expect(
      await screen.findByText('Пока нечего проверять — сданных работ нет.'),
    ).toBeInTheDocument();
  });
});

describe('GradingQueueScreen — список', () => {
  it('карточка показывает ученика, экзамен и когда сдана', async () => {
    mockApiByPath({ '/attempts': [makeAttempt()] });

    renderScreen();

    expect(await screen.findByText('Иван Иванов')).toBeInTheDocument();
    expect(screen.getByText(/Форма первого уровня/)).toBeInTheDocument();
  });

  it('сдано по времени — на карточке видна пометка', async () => {
    mockApiByPath({ '/attempts': [makeAttempt({ expired: true })] });

    renderScreen();

    expect(await screen.findByText(/сдано по времени/)).toBeInTheDocument();
  });

  it('клик по карточке открывает проверку конкретной попытки', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/attempts': [makeAttempt()] });

    renderScreen();
    await user.click(await screen.findByText('Иван Иванов'));

    expect(await screen.findByText('Карточка проверки открыта')).toBeInTheDocument();
  });
});
