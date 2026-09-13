// Мокаем apiFetch по префиксу пути (test-support/apiFetchMock.ts) — экран
// грузит /exams, а открытый лист сам грузит банк /exam-items для блоков.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
    rubric: [],
    attemptsAllowed: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <ExamsScreen />
    </MemoryRouter>,
  );
}

describe('ExamsScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    mockApiByPath({ '/exams': new Promise(() => {}), '/attempts': [] });

    const { container } = renderScreen();

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('ExamsScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и кнопка повтора, клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    const retry = screen.getByRole('button', { name: 'Попробовать ещё раз' });

    mockApiByPath({ '/exams': [makeExam()], '/attempts': [] });
    await user.click(retry);

    expect(await screen.findByText('Итоговый экзамен')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ExamsScreen — пустая база', () => {
  it('честный текст и кнопка «Новый экзамен»', async () => {
    mockApiByPath({ '/exams': [], '/attempts': [] });

    renderScreen();

    expect(
      await screen.findByText(/Экзаменов пока нет\. Соберите первый/),
    ).toBeInTheDocument();
    expect(screen.getByText(/собирается из вопросов банка/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новый экзамен' })).toBeInTheDocument();
  });
});

describe('ExamsScreen — список форм', () => {
  it('рендерит карточку с названием и статусом', async () => {
    mockApiByPath({ '/exams': [makeExam()], '/attempts': [] });

    renderScreen();

    expect(await screen.findByText('Итоговый экзамен')).toBeInTheDocument();
    expect(screen.getByText(/Черновик · Пока без блоков/)).toBeInTheDocument();
  });
});

describe('ExamsScreen — фильтр по статусу', () => {
  it('смена фильтра уходит в query запроса', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/exams': [], '/attempts': [] });

    renderScreen();
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());

    await user.selectOptions(screen.getByLabelText('Статус'), 'published');

    await waitFor(() => {
      const examCalls = mockedApiFetch.mock.calls
        .map((call) => call[0])
        .filter((path) => path.startsWith('/exams'));
      expect(examCalls.at(-1)).toContain('status=published');
    });
  });
});

describe('ExamsScreen — вход в проверку работ', () => {
  it('пустая очередь — честный текст на карточке-ссылке', async () => {
    mockApiByPath({ '/exams': [], '/attempts': [] });

    renderScreen();

    expect(await screen.findByText('Проверка работ')).toBeInTheDocument();
    expect(await screen.findByText('Пока нечего проверять.')).toBeInTheDocument();
  });

  it('есть сданные работы — число на карточке-ссылке', async () => {
    mockApiByPath({
      '/exams': [],
      '/attempts': [
        {
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
        },
      ],
    });

    renderScreen();

    expect(await screen.findByText('1 работа ждёт проверки.')).toBeInTheDocument();
  });
});

describe('ExamsScreen — лист формы', () => {
  it('«Новый экзамен» открывает пустой лист', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/exams': [], '/exam-items': [], '/attempts': [] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Новый экзамен' }));

    expect(
      await screen.findByRole('heading', { name: 'Новый экзамен' }),
    ).toBeInTheDocument();
  });

  it('«Закрыть» на листе закрывает его, список остаётся', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/exams': [], '/exam-items': [], '/attempts': [] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Новый экзамен' }));
    await screen.findByRole('heading', { name: 'Новый экзамен' });

    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('открыть карточку — лист правки с заполненным названием', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/exams': [makeExam()], '/exam-items': [], '/attempts': [] });

    renderScreen();
    await user.click(await screen.findByText('Итоговый экзамен'));

    const dialogTitle = await screen.findByRole('heading', { name: 'Экзамен' });
    const sheet = dialogTitle.closest('form') as HTMLFormElement;
    expect(sheet.querySelector('input')).toHaveValue('Итоговый экзамен');
  });
});
