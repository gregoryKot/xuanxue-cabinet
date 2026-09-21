// Экран «Задания» — рубрики новых/остальных заданий, старт попытки и переход
// на экран сдачи (решение владельца: экзамены — отдельный экран, первый
// после входа). Навигацию проверяем через настоящий react-router
// (MemoryRouter + Routes), как раньше StudentExamsSection.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, MeDto, MyExamDto } from '@xuanxue/shared';
import { MY_EXAMS_PATH, NOTIFICATIONS_FEED_PATH } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { NotificationBell } from '../notifications/NotificationBell';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { MyExamsProvider } from './MyExamsProvider';
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
      <MyExamsProvider me={null}>
        <Routes>
          <Route path="/" element={<TasksScreen />} />
          <Route path="/attempts/:id" element={<p>Экран сдачи</p>} />
        </Routes>
      </MyExamsProvider>
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
      screen.getByText(
        'Экзамены, которые открыл учитель. Каждый — с числом попыток и итогом проверки.',
      ),
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

// Регрессия: владелец трижды присылал снимок, где карточки списка стоят
// вплотную и читаются одной плашкой; третий раз — ровно этот экран, две
// карточки экзамена (docs/adr/0086). Причина была в контейнере `<ul>` без
// `gap` — строка тёплой плашки своего отступа не несёт. Теперь список берёт
// `cardListStyle` (web/src/components/listCardStyles.ts), тест проверяет
// именно это: у `<ul>` со строками есть ненулевой зазор.
describe('TasksScreen — карточки заданий не стоят вплотную', () => {
  it('у списка есть промежуток между двумя карточками экзамена', async () => {
    mockedApiFetch.mockResolvedValueOnce([
      makeExam({ id: 'e1' }),
      makeExam({ id: 'e2', title: 'Форма второго уровня' }),
    ]);
    renderScreen();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    const list = items[0]?.closest('ul');
    expect(list).not.toBeNull();
    expect(list?.style.gap).not.toBe('');
    expect(list?.style.gap).not.toBe('0px');
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

  // Сбой самого списка, а не старта: экран показывает баннер с «Обновить», и
  // кнопка обязана повторить запрос, а не просто стоять.
  it('сбой списка — «Обновить» повторяет запрос', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );
    renderScreen();

    expect(await screen.findByRole('alert')).toBeInTheDocument();

    mockedApiFetch.mockResolvedValueOnce([makeExam()]);
    screen.getByRole('button', { name: 'Обновить' }).click();

    expect(await screen.findByRole('button', { name: 'Начать' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// Состав как в проде: центр уведомлений (ADR-0063) висит у корня оболочки
// (AppShell.tsx) и читает те же экзамены — счётчик новых заданий у
// колокольчика. Пока список грузил каждый сам, экран «Задания» уходил в сеть
// за одним и тем же дважды и держал вторую, расходящуюся копию состояния.
// Дедупликацию самого провайдера проверяет MyExamsProvider.test.tsx; здесь —
// что этим общим источником пользуется именно экран.
describe('TasksScreen — список грузится один раз на экран и колокольчик', () => {
  it('запрос GET /me/exams уходит один, а не по одному на каждого читателя', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [makeExam()],
      [NOTIFICATIONS_FEED_PATH]: { items: [], unreadCount: 0 },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <MyExamsProvider me={null}>
          <NotificationsProvider me={null}>
            <Routes>
              <Route path="/" element={<TasksScreen />} />
            </Routes>
          </NotificationsProvider>
        </MyExamsProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Начать' })).toBeInTheDocument();
    const examsCalls = mockedApiFetch.mock.calls.filter(
      ([path]) => path === MY_EXAMS_PATH,
    );
    expect(examsCalls).toHaveLength(1);
  });
});

// ADR-0074, уточнение после слияния с MyExamsProvider: «/tasks» — маршрут
// штата школы, на котором общий запрос экзаменов всё-таки включён (иначе сам
// экран не увидел бы список), но это не должно вернуть штату старый баг —
// «новое задание» в счётчике уведомлений. Гарантия — на useNotificationsData
// (роль фильтрует newTasks независимо от того, идёт ли сейчас запрос), не
// здесь; этот тест проверяет ровно то, что у одного человека оба факта верны
// одновременно, воспроизводя реальный состав экрана (AppShell.tsx).
describe('TasksScreen — штат школы на «/tasks»: список виден, но не в счётчике уведомлений', () => {
  it('ассистент видит форму на экране, а колокольчик её не считает', async () => {
    const ASSISTANT: MeDto = {
      id: 'u3',
      name: 'Помощник',
      roles: ['assistant'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
    };
    mockApiByPath({
      [MY_EXAMS_PATH]: [makeExam()],
      [NOTIFICATIONS_FEED_PATH]: { items: [], unreadCount: 0 },
    });

    render(
      <MemoryRouter initialEntries={['/tasks']}>
        <MyExamsProvider me={ASSISTANT}>
          <NotificationsProvider me={ASSISTANT}>
            <NotificationBell />
            <Routes>
              <Route path="/tasks" element={<TasksScreen />} />
            </Routes>
          </NotificationsProvider>
        </MyExamsProvider>
      </MemoryRouter>,
    );

    // Экран — форма видна и её можно начать (запрос включён ради «/tasks»).
    expect(await screen.findByRole('button', { name: 'Начать' })).toBeInTheDocument();
    // Колокольчик — «новое задание» в счётчик не идёт: имя ссылки без
    // «, N новых» и есть отсутствие пилюли (NotificationBell.test.tsx).
    expect(screen.getByRole('link', { name: 'Уведомления' })).toBeInTheDocument();
  });
});
