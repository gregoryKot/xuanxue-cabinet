// Мокаем apiFetch по префиксу пути (test-support/apiFetchMock.ts) — экран
// грузит /exams, /attempts (очередь проверки), /exam-items/stats-summary
// (число на «Вопросы») и /exam-images/stats-summary (картинки
// вариантов, ADR-0035). `/exam-items/stats-summary` — ключ раньше общего
// `/exam-items` в объектах ниже: mockApiByPath матчит по первому подходящему
// префиксу. Редактор экзамена — отдельная страница со своим адресом
// (ADR-0033), здесь проверяется только переход на неё.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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
    shuffleOptions: false,
    attemptsAllowed: 1,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NO_STRUGGLING = { '/exam-items/stats-summary': { strugglingCount: 0 } };
const NO_IMAGES = { '/exam-images/stats-summary': { count: 0, totalBytes: 0 } };
// Большинство тестов экрана не проверяют картинки/спотыкающиеся вопросы —
// оба хука экрана всё равно шлют запрос, и без ответа mockApiByPath бросает
// «неожиданный путь» (test-support/apiFetchMock.ts).
const DEFAULT_SUMMARIES = { ...NO_STRUGGLING, ...NO_IMAGES };

/** Куда ушёл экран: путь редактора рисуется текстом, и тест читает его
 * глазами пользователя, а не через мок useNavigate. */
function PathProbe() {
  return <p>Открыт адрес {useLocation().pathname}</p>;
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/exams']}>
      <Routes>
        <Route path="/exams" element={<ExamsScreen />} />
        <Route path="/exams/new" element={<PathProbe />} />
        <Route path="/exams/:examId" element={<PathProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ExamsScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    mockApiByPath({
      ...DEFAULT_SUMMARIES,
      '/exams': new Promise(() => {}),
      '/attempts': [],
    });

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

    mockApiByPath({ ...DEFAULT_SUMMARIES, '/exams': [makeExam()], '/attempts': [] });
    await user.click(retry);

    expect(await screen.findByText('Итоговый экзамен')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ExamsScreen — пустая база', () => {
  it('честный текст, заголовок раздела и кнопка «Новый экзамен»', async () => {
    mockApiByPath({ ...DEFAULT_SUMMARIES, '/exams': [], '/attempts': [] });

    renderScreen();

    expect(screen.getByRole('heading', { name: 'Экзамены' })).toBeInTheDocument();
    expect(
      await screen.findByText(/Экзаменов пока нет\. Соберите первый/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новый экзамен' })).toBeInTheDocument();
  });
});

describe('ExamsScreen — список форм', () => {
  it('рендерит строку с названием, метаданными и статусом', async () => {
    mockApiByPath({ ...DEFAULT_SUMMARIES, '/exams': [makeExam()], '/attempts': [] });

    renderScreen();

    const title = await screen.findByText('Итоговый экзамен');
    const row = title.closest('li') as HTMLLIElement;
    expect(
      within(row).getByText('Пока без вопросов · 1 попытка · без ограничения'),
    ).toBeInTheDocument();
    expect(within(row).getByText('Черновик')).toBeInTheDocument();
  });
});

describe('ExamsScreen — фильтр по статусу', () => {
  it('переключатель статуса уходит в query запроса', async () => {
    const user = userEvent.setup();
    mockApiByPath({ ...DEFAULT_SUMMARIES, '/exams': [], '/attempts': [] });

    renderScreen();
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Опубликован' }));

    await waitFor(() => {
      const examCalls = mockedApiFetch.mock.calls
        .map((call) => call[0])
        .filter((path) => path.startsWith('/exams'));
      expect(examCalls.at(-1)).toContain('status=published');
    });
  });
});

describe('ExamsScreen — поиск по названию', () => {
  it('название не совпадает с запросом — честный текст «нет по фильтрам»', async () => {
    mockApiByPath({ ...DEFAULT_SUMMARIES, '/exams': [makeExam()], '/attempts': [] });

    renderScreen();
    await screen.findByText('Итоговый экзамен');

    await userEvent.type(screen.getByLabelText('Поиск по названию'), 'толкающие');

    expect(
      await screen.findByText('С такими фильтрами экзаменов нет.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Итоговый экзамен')).not.toBeInTheDocument();
  });
});

describe('ExamsScreen — вход в проверку работ', () => {
  it('пустая очередь — честный текст в карточке «Проверка»', async () => {
    mockApiByPath({ ...DEFAULT_SUMMARIES, '/exams': [], '/attempts': [] });

    renderScreen();

    expect(await screen.findByText('Пока нечего проверять.')).toBeInTheDocument();
  });

  it('есть сданные работы — число крупной строкой в карточке «Проверка»', async () => {
    mockApiByPath({
      ...DEFAULT_SUMMARIES,
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

describe('ExamsScreen — вход в вопросы', () => {
  it('без спотыкающихся вопросов — только объяснение раздела, без числа', async () => {
    mockApiByPath({ ...DEFAULT_SUMMARIES, '/exams': [], '/attempts': [] });

    renderScreen();

    expect(
      await screen.findByText(
        'Из них собирается экзамен — один вопрос можно поставить в несколько экзаменов.',
      ),
    ).toBeInTheDocument();
  });

  it('есть спотыкающиеся вопросы — число дописано к объяснению раздела', async () => {
    mockApiByPath({
      '/exam-items/stats-summary': { strugglingCount: 2 },
      ...NO_IMAGES,
      '/exams': [],
      '/attempts': [],
    });

    renderScreen();

    expect(
      await screen.findByText(/2 вопроса путают больше половины ответивших\./),
    ).toBeInTheDocument();
  });
});

describe('ExamsScreen — вход в картинки вариантов ответа', () => {
  it('картинок нет — строка про них не рисуется', async () => {
    mockApiByPath({ ...DEFAULT_SUMMARIES, '/exams': [], '/attempts': [] });

    renderScreen();

    await screen.findByText('Пока нечего проверять.');
    expect(screen.queryByText(/Картинок к вопросам/)).not.toBeInTheDocument();
  });

  it('есть картинки — строка с числом и объёмом под объяснением вопросов', async () => {
    mockApiByPath({
      ...NO_STRUGGLING,
      '/exam-images/stats-summary': { count: 12, totalBytes: 3_600_000 },
      '/exams': [],
      '/attempts': [],
    });

    renderScreen();

    expect(
      await screen.findByText(/Картинок к вопросам: 12 — 3,4 МБ/),
    ).toBeInTheDocument();
  });
});

describe('ExamsScreen — переход в редактор', () => {
  it('«Новый экзамен» ведёт на /exams/new', async () => {
    const user = userEvent.setup();
    mockApiByPath({ ...DEFAULT_SUMMARIES, '/exams': [], '/attempts': [] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Новый экзамен' }));

    expect(screen.getByText('Открыт адрес /exams/new')).toBeInTheDocument();
  });

  it('строка списка ведёт на адрес своего экзамена', async () => {
    const user = userEvent.setup();
    mockApiByPath({ ...DEFAULT_SUMMARIES, '/exams': [makeExam()], '/attempts': [] });

    renderScreen();
    await user.click(await screen.findByText('Итоговый экзамен'));

    expect(screen.getByText('Открыт адрес /exams/x1')).toBeInTheDocument();
  });
});
