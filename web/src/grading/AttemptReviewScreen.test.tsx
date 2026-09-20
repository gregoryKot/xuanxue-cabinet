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

    mockApiByPath({
      '/attempts/a1/grading': undefined,
      '/attempts/a1/review': makeReview({ status: 'graded' }),
    });
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

    mockApiByPath({
      '/attempts/a1/grading': new ApiError(
        'Эту работу ещё нельзя проверить: ученик её не сдал.',
        400,
        'invalid_input',
      ),
      '/attempts/a1/review': makeReview(),
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(
      await screen.findByText('Эту работу ещё нельзя проверить: ученик её не сдал.'),
    ).toBeInTheDocument();
  });
});

const VIDEO_QUESTION_BLOCKS = [
  {
    id: 'b2',
    title: 'Практика',
    questions: [
      {
        itemId: 'q2',
        kind: 'video' as const,
        prompt: 'Снимите форму «пэнбу»',
        options: [],
      },
    ],
  },
];

describe('AttemptReviewScreen — видео у своего вопроса (ADR-0023, ADR-0037)', () => {
  it('видео-вопрос без видео — кнопка ручной отметки шлёт POST с itemId и перечитывает карточку', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/attempts': makeReview({ blocks: VIDEO_QUESTION_BLOCKS }) });

    renderAt('a1');
    await screen.findByText('Видео пока не получено.');

    // Ответы на клик — по пути (см. mockApiByPath в test-support): очередь
    // `…Once` здесь забирала форма оценки своими заготовками, и reload
    // получал карточку без видео — тест мигал (CI на main, a155bc1).
    mockApiByPath({
      '/attempts/a1/media/manual': undefined,
      '/attempts/a1/review': makeReview({
        blocks: VIDEO_QUESTION_BLOCKS,
        media: [
          {
            id: 'm1',
            attemptId: 'a1',
            itemId: 'q2',
            kind: 'manual',
            receivedAt: '2026-09-12T00:00:00Z',
          },
        ],
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Отметить, что видео принято' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/manual', {
      method: 'POST',
      body: { itemId: 'q2' },
    });
    expect(await screen.findByText('Есть ответ')).toBeInTheDocument();
    expect(await screen.findByText('Отмечено вручную, без подписи.')).toBeInTheDocument();
  });

  it('видео своего вопроса получено по ссылке — метка «Есть ответ» и кликабельная ссылка у вопроса', async () => {
    mockApiByPath({
      '/attempts': makeReview({
        blocks: VIDEO_QUESTION_BLOCKS,
        media: [
          {
            id: 'm1',
            attemptId: 'a1',
            itemId: 'q2',
            kind: 'link',
            url: 'https://example.com/v',
            receivedAt: '2026-09-12T00:00:00Z',
          },
        ],
      }),
    });

    renderAt('a1');

    expect(await screen.findByText('Есть ответ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть ссылку на видео' })).toHaveAttribute(
      'href',
      'https://example.com/v',
    );
  });

  it('видео без itemId (деплой на стыке версий) — отдельный блок «Видео без вопроса», не теряется', async () => {
    mockApiByPath({
      '/attempts': makeReview({
        media: [
          {
            id: 'm1',
            attemptId: 'a1',
            kind: 'telegram',
            durationSec: 12,
            receivedAt: '2026-09-12T00:00:00Z',
          },
        ],
      }),
    });

    renderAt('a1');

    expect(
      await screen.findByRole('heading', { name: 'Видео без вопроса' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Переслано боту в Telegram. Видео смотрите там же.'),
    ).toBeInTheDocument();
  });
});

// Снимок владельца с телефона: экран сливался с бумагой, ссылка возврата
// тянула подчёркивание во всю ширину, длинное имя вылезало за край
// (docs/adr/0043, ТЗ переоблика). jsdom не вычисляет `var(--…)` — сравниваем
// ровно строку инлайн-стиля, не вычисленный цвет.
describe('AttemptReviewScreen — облик (снимок владельца, ADR-0043)', () => {
  it('рубрика над именем есть, длинное имя-почта переносится, а не обрезается', async () => {
    mockApiByPath({
      '/attempts': makeReview({ userName: 'doctor.martynova@gmail.com' }),
    });

    renderAt('a1');
    await screen.findByText('Форма первого уровня');

    expect(screen.getByText('Работа ученика')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('doctor.martynova@gmail.com');
    expect(heading.style.overflowWrap).toBe('anywhere');
  });

  it('ссылка возврата к очереди — по содержимому, не растянута на всю ширину', async () => {
    mockApiByPath({ '/attempts': makeReview() });

    renderAt('a1');
    await screen.findByText('Форма первого уровня');

    const backLink = screen.getByRole('link', { name: 'Вернуться к очереди проверки' });
    expect(backLink.style.alignSelf).toBe('flex-start');
  });

  it('карточка ответов и карточка проверки — с фоном var(--card)', async () => {
    mockApiByPath({ '/attempts': makeReview() });

    const { container } = renderAt('a1');
    await screen.findByText('Форма первого уровня');

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>('div, aside'),
    ).filter((el) => el.style.background === 'var(--card)');
    expect(cards).toHaveLength(2);
  });
});
