import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { ExamItemStats } from './ExamItemStats';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('ExamItemStats — загрузка', () => {
  it('показывает скелетон, пока статистика не пришла', () => {
    mockApiByPath({ '/exam-items': new Promise(() => {}) });

    const { container } = render(<ExamItemStats itemId="i1" />);

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('ExamItemStats — сбой загрузки', () => {
  it('текст ошибки и кнопка повтора', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    render(<ExamItemStats itemId="i1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
  });

  it('клик «Попробовать ещё раз» повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    render(<ExamItemStats itemId="i1" />);
    await screen.findByRole('alert');

    mockApiByPath({
      '/exam-items': { itemId: 'i1', kind: 'text', askedCount: 0, usedInExamsCount: 0 },
    });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByText('Этот вопрос ещё никому не задавали.'),
    ).toBeInTheDocument();
  });
});

describe('ExamItemStats — карточка без чисел', () => {
  it('вопрос, который ещё не задавали — честный текст, ни одного числа-мусора', async () => {
    mockApiByPath({
      '/exam-items': { itemId: 'i1', kind: 'single', askedCount: 0, usedInExamsCount: 0 },
    });

    render(<ExamItemStats itemId="i1" />);

    expect(
      await screen.findByText('Этот вопрос ещё никому не задавали.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('ExamItemStats — карточка с числами', () => {
  it('вопрос с вариантами — сводка и разбор по вариантам', async () => {
    mockApiByPath({
      '/exam-items': {
        itemId: 'i1',
        kind: 'single',
        askedCount: 3,
        usedInExamsCount: 0,
        correctCount: 2,
        correctRate: 2 / 3,
        options: [
          { id: 'o1', text: 'пять', correct: true, chosenCount: 2 },
          { id: 'o2', text: 'три', correct: false, chosenCount: 1 },
        ],
      },
    });

    render(<ExamItemStats itemId="i1" />);

    expect(
      await screen.findByText('Задавали 3 раза, верно ответили 2.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('«пять» — выбрали 2 раза. Верный вариант.'),
    ).toBeInTheDocument();
    expect(screen.getByText('«три» — выбрали 1 раз.')).toBeInTheDocument();
  });

  it('вопрос без вариантов, но уже заданный — только сводка, без списка', async () => {
    mockApiByPath({
      '/exam-items': { itemId: 'i1', kind: 'text', askedCount: 4, usedInExamsCount: 0 },
    });

    render(<ExamItemStats itemId="i1" />);

    expect(await screen.findByText('Задавали 4 раза.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('вопрос используется в форме — предупреждение перед удалением/архивацией', async () => {
    mockApiByPath({
      '/exam-items': { itemId: 'i1', kind: 'text', askedCount: 0, usedInExamsCount: 2 },
    });

    render(<ExamItemStats itemId="i1" />);

    expect(
      await screen.findByText(
        'Стоит в 2 экзаменах — нельзя удалить или заархивировать, не убрав его оттуда.',
      ),
    ).toBeInTheDocument();
  });

  it('вопрос нигде не используется — предупреждения нет', async () => {
    mockApiByPath({
      '/exam-items': { itemId: 'i1', kind: 'text', askedCount: 0, usedInExamsCount: 0 },
    });

    render(<ExamItemStats itemId="i1" />);

    await screen.findByText('Этот вопрос ещё никому не задавали.');
    expect(screen.queryByText(/Стоит в/)).not.toBeInTheDocument();
  });

  it('успешная загрузка снимает скелетон', async () => {
    mockApiByPath({
      '/exam-items': { itemId: 'i1', kind: 'text', askedCount: 0, usedInExamsCount: 0 },
    });

    const { container } = render(<ExamItemStats itemId="i1" />);

    await waitFor(() =>
      expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(0),
    );
  });
});
