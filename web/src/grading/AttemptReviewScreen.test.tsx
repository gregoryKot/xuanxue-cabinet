// «Карточка» проверки целиком — критерии и ответ ученика видны, отправка
// оценки шлёт правильное тело запроса, ошибка сервера показывается (ТЗ 4.6).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptReviewDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import AttemptReviewScreen from './AttemptReviewScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makeReview(overrides: Partial<AttemptReviewDto> = {}): AttemptReviewDto {
  return {
    attemptId: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    userName: 'Иван Иванов',
    status: 'submitted',
    blocks: [
      {
        id: 'b1',
        title: 'Теория',
        questions: [
          {
            itemId: 'q1',
            kind: 'text',
            prompt: 'Опишите дыхание',
            criteria: 'Дыхание ровное, без задержек',
            answerText: 'Дышу животом, ровно',
            options: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function renderAt(attemptId: string) {
  return render(
    <MemoryRouter initialEntries={[`/grading/${attemptId}`]}>
      <Routes>
        <Route path="/grading" element={<p>Очередь проверки</p>} />
        <Route path="/grading/:attemptId" element={<AttemptReviewScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AttemptReviewScreen — загрузка', () => {
  it('показывает скелетон, пока карточка не пришла', () => {
    mockApiByPath({ '/attempts': new Promise(() => {}) });

    const { container } = renderAt('a1');

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('AttemptReviewScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и кнопка повтора', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Работа не найдена. Обновите страницу.', 404, 'not_found'),
    );

    renderAt('a1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Работа не найдена. Обновите страницу.',
    );
  });
});

describe('AttemptReviewScreen — повтор и путь без id', () => {
  it('«Попробовать ещё раз» повторяет запрос карточки', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сеть подвела', 500, 'internal_error'),
    );

    renderAt('a1');
    await screen.findByRole('alert');
    mockedApiFetch.mockResolvedValueOnce(makeReview());

    await user.click(screen.getByRole('button', { name: /ещё раз/i }));

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
  });

  // Маршрут без :attemptId в кабинете не встречается, но компонент не должен
  // падать на `undefined` в пути — хук получает пустую строку и показывает
  // баннер, а не белый экран.
  it('путь без id — баннер вместо падения', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Работа не найдена', 404, 'not_found'),
    );

    render(
      <MemoryRouter initialEntries={['/grading/']}>
        <Routes>
          <Route path="/grading/" element={<AttemptReviewScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('AttemptReviewScreen — нет данных без ошибки сети', () => {
  // Список своих попыток у /attempts/:id/review нет — возможен только один
  // GET, но защитная ветка на случай пустого ответа без ApiError не должна
  // падать: баннер с пустым текстом, не белый экран.
  it('ответ без review и без ошибки — баннер без падения', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);

    renderAt('a1');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('AttemptReviewScreen — карточка', () => {
  it('видны критерии проверки вопроса и ответ ученика', async () => {
    mockApiByPath({ '/attempts': makeReview() });

    renderAt('a1');

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
    expect(
      screen.getByText(/Критерии проверки: Дыхание ровное, без задержек/),
    ).toBeInTheDocument();
    expect(screen.getByText('Дышу животом, ровно')).toBeInTheDocument();
  });

  it('вопрос с вариантами — виден верный и выбранный ученика', async () => {
    mockApiByPath({
      '/attempts': makeReview({
        blocks: [
          {
            id: 'b1',
            title: 'Теория',
            questions: [
              {
                itemId: 'q2',
                kind: 'single',
                prompt: 'Сколько стоек в форме?',
                options: [
                  { id: 'o1', text: 'Три', correct: true, selected: false },
                  { id: 'o2', text: 'Пять', correct: false, selected: true },
                ],
                optionsCheck: {
                  correctSelectedCount: 0,
                  correctTotalCount: 1,
                  incorrectSelectedCount: 1,
                },
              },
            ],
          },
        ],
      }),
    });

    renderAt('a1');

    const correctOption = await screen.findByText('Три');
    expect(correctOption.closest('li')).toHaveTextContent('Три — верный');
    const selectedOption = screen.getByText('Пять');
    expect(selectedOption.closest('li')).toHaveTextContent('Пять · выбрал ученик');
    expect(screen.getByText(/Выбрано верно 0 из 1, ещё 1 лишний/)).toBeInTheDocument();
  });

  it('оценка уже стоит — ответ сервера открывает форму заполненной', async () => {
    mockApiByPath({
      '/attempts': makeReview({
        grading: {
          id: 'g1',
          attemptId: 'a1',
          examId: 'e1',
          userId: 'u1',
          graderId: 't1',
          comment: 'Проверьте дыхание',
          outcome: 'needs_work',
          gradedAt: '2026-01-01T00:00:00Z',
        },
      }),
    });

    renderAt('a1');

    expect(await screen.findByLabelText('Комментарий')).toHaveValue('Проверьте дыхание');
    expect(screen.getByLabelText('Итог')).toHaveValue('needs_work');
    expect(screen.getByRole('button', { name: 'Переписать оценку' })).toBeInTheDocument();
  });
});

describe('AttemptReviewScreen — отправка оценки', () => {
  it('заполненная форма — PUT с правильным телом', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/attempts': makeReview() });

    renderAt('a1');
    await screen.findByText('Форма первого уровня');

    await user.type(screen.getByLabelText('Комментарий'), 'Хорошо сдал');
    await user.selectOptions(screen.getByLabelText('Итог'), 'passed');

    mockedApiFetch.mockResolvedValueOnce(undefined);
    mockedApiFetch.mockResolvedValueOnce(makeReview({ status: 'graded' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/grading', {
      method: 'PUT',
      body: {
        comment: 'Хорошо сдал',
        outcome: 'passed',
      },
    });
  });

  it('сбой сервера — сообщение под формой', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/attempts': makeReview() });

    renderAt('a1');
    await screen.findByText('Форма первого уровня');

    await user.selectOptions(screen.getByLabelText('Итог'), 'passed');

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(
        'Эту работу ещё нельзя проверить: ученик её не сдал.',
        400,
        'invalid_input',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(
      await screen.findByText('Эту работу ещё нельзя проверить: ученик её не сдал.'),
    ).toBeInTheDocument();
  });
});

describe('AttemptReviewScreen — видео (ADR-0023)', () => {
  it('видео нет — кнопка ручной отметки шлёт POST и перечитывает карточку', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/attempts': makeReview() });

    renderAt('a1');
    await screen.findByText('Видео пока не получено.');

    mockedApiFetch.mockResolvedValueOnce(undefined);
    mockedApiFetch.mockResolvedValueOnce(
      makeReview({
        media: [
          {
            id: 'm1',
            attemptId: 'a1',
            kind: 'manual',
            receivedAt: '2026-09-12T00:00:00Z',
          },
        ],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Отметить, что видео принято' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/manual', {
      method: 'POST',
      body: {},
    });
    expect(await screen.findByText('Отмечено вручную, без подписи.')).toBeInTheDocument();
  });

  it('видео получено по ссылке — карточка показывает кликабельную ссылку', async () => {
    mockApiByPath({
      '/attempts': makeReview({
        media: [
          {
            id: 'm1',
            attemptId: 'a1',
            kind: 'link',
            url: 'https://example.com/v',
            receivedAt: '2026-09-12T00:00:00Z',
          },
        ],
      }),
    });

    renderAt('a1');

    expect(
      await screen.findByRole('link', { name: 'Открыть ссылку на видео' }),
    ).toHaveAttribute('href', 'https://example.com/v');
  });
});
