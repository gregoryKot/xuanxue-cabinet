// Страница редактора экзамена целиком: загрузка, поля, список вопросов,
// поиск по вопросам, настройки прохождения, подвал (ADR-0033). Мок сети — по
// префиксу пути (test-support/apiFetchMock.ts); `/exams/x1` стоит раньше
// `/exams`, mockApiByPath матчит первым подходящим префиксом. Черновик
// (ADR-0052) пишется в реальный localStorage — очищаем между тестами, иначе
// черновик одного теста восстановился бы в соседнем (id экзамена в
// makeExam() один и тот же).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXAM_LIMITS } from '@xuanxue/shared';
import type { ExamDto, ExamItemDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import ExamEditorScreen from './ExamEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

afterEach(() => {
  localStorage.clear();
  // jsdom не реализует scrollIntoView — тест черновика сам кладёт мок на
  // Element.prototype, снимаем его, чтобы не утекал в соседний тест.
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

const LIST_MARKER = 'Здесь список экзаменов';
const PREVIEW_MARKER = 'Здесь предпросмотр экзамена';

function makeExam(overrides: Partial<ExamDto> = {}): ExamDto {
  return {
    id: 'x1',
    title: 'Первый уровень',
    description: 'Что вы умеете после первого года',
    level: 'первый уровень',
    blocks: [{ id: 'b1', title: '', itemIds: ['i1', 'i2'], shuffle: false }],
    shuffleOptions: false,
    attemptsAllowed: 2,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'single',
    prompt: 'Зачем придумали тайцзи?',
    options: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const BANK = [
  makeItem({ id: 'i1', prompt: 'Зачем придумали тайцзи?' }),
  makeItem({ id: 'i2', prompt: 'Жить здорово?', kind: 'text' }),
  makeItem({ id: 'i3', prompt: 'Что такое «пустая» нога?' }),
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/exams" element={<p>{LIST_MARKER}</p>} />
        <Route path="/exam-items" element={<p>Здесь вопросы</p>} />
        <Route path="/exams/new" element={<ExamEditorScreen />} />
        <Route path="/exams/:examId" element={<ExamEditorScreen />} />
        <Route path="/exams/:examId/preview" element={<p>{PREVIEW_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockExamAndBank(
  exam: ExamDto,
  bank: ExamItemDto[] = BANK,
  attemptCount: { total: number } = { total: 0 },
) {
  // '/exams/x1/attempt-count' — первым: mockApiByPath матчит первым
  // подходящим префиксом, а он сам начинается с '/exams/x1' — ниже строкой
  // этот путь достался бы ответу за экзаменом целиком.
  mockApiByPath({
    '/exams/x1/attempt-count': attemptCount,
    '/exams/x1': exam,
    '/exam-items': bank,
    '/exams': exam,
  });
}

function lastCallWithMethod(method: string) {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
}

// «Сохранить» стоит на странице дважды — наверху рядом с заголовком и в
// подвале под списком вопросов (ADR-0138): оба submit одной формы, для клика
// в тесте годится любой — берём первый.
function saveButton(): HTMLElement {
  return screen.getAllByRole('button', { name: 'Сохранить' })[0] as HTMLElement;
}

async function findSaveButton(): Promise<HTMLElement> {
  return (await screen.findAllByRole('button', { name: 'Сохранить' }))[0] as HTMLElement;
}

// Текст всплывающей подсказки (components/InfoTip.tsx) рендерится только
// открытым — тап по кнопке «Подсказка: …» перед проверкой текста.
async function openTip(user: ReturnType<typeof userEvent.setup>, fieldLabel: string) {
  await user.click(screen.getByRole('button', { name: `Подсказка: ${fieldLabel}` }));
}

describe('ExamEditorScreen — загрузка', () => {
  it('экзамен ещё грузится — скелетон, а не пустой экран', () => {
    mockApiByPath({ '/exams/x1': new Promise(() => {}), '/exam-items': BANK });

    const { container } = renderAt('/exams/x1');

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('сбой загрузки — текст ошибки и повтор', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/exams/x1': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/exam-items': BANK,
    });

    renderAt('/exams/x1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockExamAndBank(makeExam());
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByRole('heading', { name: 'Первый уровень' })).toBeVisible();
  });

  it('/exams/new — заголовок «Новый экзамен», запроса за экзаменом нет', async () => {
    mockApiByPath({ '/exam-items': BANK, '/exams': [] });

    renderAt('/exams/new');

    expect(
      await screen.findByRole('heading', { name: 'Новый экзамен' }),
    ).toBeInTheDocument();
    const examCalls = mockedApiFetch.mock.calls.filter((call) =>
      String(call[0]).startsWith('/exams'),
    );
    expect(examCalls).toHaveLength(0);
  });
});

describe('ExamEditorScreen — поля «О чём экзамен»', () => {
  it('поля заполнены из ответа сервера, подсказка уровня — во всплывающей подсказке', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');

    expect(await screen.findByLabelText('Название')).toHaveValue('Первый уровень');
    expect(screen.getByLabelText('Описание для ученика')).toHaveValue(
      'Что вы умеете после первого года',
    );
    expect(screen.getByLabelText('Уровень')).toHaveValue('первый уровень');

    await openTip(user, 'Уровень');
    expect(
      screen.getByText('Ученик увидит его в скобках после названия.'),
    ).toBeInTheDocument();
  });

  it('правки полей уходят в тело сохранения', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.clear(await screen.findByLabelText('Описание для ученика'));
    await user.type(screen.getByLabelText('Описание для ученика'), 'Новое описание');
    await user.clear(screen.getByLabelText('Уровень'));
    await user.type(screen.getByLabelText('Уровень'), 'второй уровень');
    await user.click(saveButton());

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as {
      body: { description: string; level: string };
    };
    expect(body.body.description).toBe('Новое описание');
    expect(body.body.level).toBe('второй уровень');
  });

  it('пустое название — ошибка формы, запроса нет', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ title: '' }));

    renderAt('/exams/x1');
    await screen.findByLabelText('Название');
    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Впишите название');
    expect(lastCallWithMethod('PATCH')).toHaveLength(0);
  });
});

describe('ExamEditorScreen — список вопросов', () => {
  it('вопросы пронумерованы, под каждым тип', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');

    expect(await screen.findByText('Вопросы · 2')).toBeInTheDocument();
    // Ждём вопросы: формулировки и строку с типом подставляет запрос.
    await screen.findAllByText('Один правильный вариант');
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0] as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(
      within(rows[0] as HTMLElement).getByText('Зачем придумали тайцзи?'),
    ).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Жить здорово?')).toBeInTheDocument();
  });

  it('«Ниже» меняет порядок и уходит в тело сохранения', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Зачем придумали тайцзи?');
    const firstRow = screen.getAllByRole('listitem')[0] as HTMLElement;
    await user.click(within(firstRow).getByRole('button', { name: 'Ниже' }));
    await user.click(saveButton());

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as { body: { blocks: unknown[] } };
    expect(body.body.blocks).toEqual([
      { id: 'b1', title: '', itemIds: ['i2', 'i1'], shuffle: false },
    ]);
  });

  it('«Выше» на первом вопросе недоступно, на втором — работает', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Зачем придумали тайцзи?');
    const rows = screen.getAllByRole('listitem');
    expect(
      within(rows[0] as HTMLElement).getByRole('button', { name: 'Выше' }),
    ).toBeDisabled();

    await user.click(
      within(rows[1] as HTMLElement).getByRole('button', { name: 'Выше' }),
    );

    const after = screen.getAllByRole('listitem');
    expect(
      within(after[0] as HTMLElement).getByText('Жить здорово?'),
    ).toBeInTheDocument();
  });

  it('«Убрать из экзамена» убирает вопрос и возвращает его в список', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Зачем придумали тайцзи?');
    const rows = screen.getAllByRole('listitem');
    await user.click(
      within(rows[0] as HTMLElement).getByRole('button', { name: 'Убрать из экзамена' }),
    );

    expect(screen.getByText('Вопросы · 1')).toBeInTheDocument();
    // Убранный вопрос снова доступен в списке: было одно «Добавить», стало два.
    expect(screen.getAllByRole('button', { name: 'Добавить' })).toHaveLength(2);
  });

  it('вопросов ещё нет — честный текст, а не пустота', async () => {
    mockExamAndBank(makeExam({ blocks: [] }));

    renderAt('/exams/x1');

    expect(await screen.findByText(/Вопросов пока нет/)).toBeInTheDocument();
  });

  it('вопрос экзамена не найден в списке — честный текст вместо молчания', async () => {
    mockExamAndBank(
      makeExam({ blocks: [{ id: 'b1', title: '', itemIds: ['gone'], shuffle: false }] }),
    );

    renderAt('/exams/x1');

    expect(await screen.findByText(/Вопрос недоступен/)).toBeInTheDocument();
  });

  it('старая многоблочная форма — один список подряд, сохраняется одним блоком', async () => {
    const user = userEvent.setup();
    mockExamAndBank(
      makeExam({
        blocks: [
          { id: 'b1', title: 'Теория', itemIds: ['i1'], shuffle: true },
          { id: 'b2', title: 'Форма', itemIds: ['i2'], shuffle: false },
        ],
      }),
    );

    renderAt('/exams/x1');
    expect(await screen.findByText('Вопросы · 2')).toBeInTheDocument();
    expect(screen.queryByText(/Теория/)).not.toBeInTheDocument();

    await user.click(saveButton());

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as { body: { blocks: unknown[] } };
    expect(body.body.blocks).toEqual([
      { id: 'b1', title: '', itemIds: ['i1', 'i2'], shuffle: true },
    ]);
  });
});

// Заметка о прошлых попытках (ADR-0022): попытка хранит снимок формы на
// старте, правка вопросов в уже начатую или сданную работу не попадёт.
describe('ExamEditorScreen — заметка о прошлых попытках (ADR-0022)', () => {
  it('есть попытки — заметка под «Вопросы · N» с их числом', async () => {
    mockExamAndBank(makeExam(), BANK, { total: 3 });

    renderAt('/exams/x1');

    expect(await screen.findByText(/Экзамен уже проходили/)).toBeInTheDocument();
  });

  it('попыток ещё не было — заметки нет', async () => {
    mockExamAndBank(makeExam(), BANK, { total: 0 });

    renderAt('/exams/x1');
    await screen.findByText('Зачем придумали тайцзи?');

    expect(screen.queryByText(/Экзамен уже проходили/)).not.toBeInTheDocument();
  });
});

describe('ExamEditorScreen — поиск по вопросам', () => {
  it('поиск стоит на месте сразу, кнопки-переключателя нет', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');

    expect(await screen.findByLabelText('Найти вопрос — по тексту')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Скрыть список вопросов/ }),
    ).not.toBeInTheDocument();
  });

  it('добавленные вопросы в кандидатах не показываются', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Что такое «пустая» нога?');

    expect(screen.getAllByRole('button', { name: 'Добавить' })).toHaveLength(1);
  });

  it('по запросу ничего не нашлось — честный текст', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ blocks: [] }));

    renderAt('/exams/x1');
    await screen.findByText('Что такое «пустая» нога?');
    await user.type(screen.getByLabelText('Найти вопрос — по тексту'), 'веник');

    expect(screen.getByText('По этому запросу ничего не нашлось.')).toBeInTheDocument();
  });

  it('все вопросы уже в экзамене — так и сказано', async () => {
    mockExamAndBank(
      makeExam({
        blocks: [{ id: 'b1', title: '', itemIds: ['i1', 'i2', 'i3'], shuffle: false }],
      }),
    );

    renderAt('/exams/x1');

    expect(await screen.findByText('Все вопросы уже в экзамене.')).toBeInTheDocument();
  });

  it('«Добавить» ставит вопрос в конец списка', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Что такое «пустая» нога?');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(screen.getByText('Вопросы · 3')).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(
      within(rows[2] as HTMLElement).getByText('Что такое «пустая» нога?'),
    ).toBeInTheDocument();
  });

  it('опубликованных вопросов нет — честный текст и ссылка на вопросы', async () => {
    mockExamAndBank(makeExam({ blocks: [] }), [
      makeItem({ id: 'i9', status: 'draft', prompt: 'Спрятанный вопрос' }),
    ]);

    renderAt('/exams/x1');

    expect(
      await screen.findByText(/Опубликованных вопросов пока нет/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть вопросы' })).toHaveAttribute(
      'href',
      '/exam-items',
    );
    expect(screen.queryByText('Спрятанный вопрос')).not.toBeInTheDocument();
  });

  it('вопросы не загрузились — баннер, повтор снова просит вопросы', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/exams/x1': makeExam(),
      '/exam-items': new ApiError('Вопросы недоступны', 503, 'unknown'),
    });

    renderAt('/exams/x1');
    expect(await screen.findByText('Вопросы недоступны')).toBeInTheDocument();

    mockExamAndBank(makeExam());
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Что такое «пустая» нога?')).toBeInTheDocument();
  });

  it('вопросов уже предельно много — вместо кандидатов объяснение', async () => {
    // Ровно предел, а не литерал 50: предел вырос до 100 под первый настоящий
    // экзамен школы (ADR-0064), и тест обязан проверять границу, а не число.
    const many = Array.from(
      { length: EXAM_LIMITS.itemsPerBlockMax },
      (_, i) => `i${i + 100}`,
    );
    mockExamAndBank(
      makeExam({ blocks: [{ id: 'b1', title: '', itemIds: many, shuffle: false }] }),
    );

    renderAt('/exams/x1');

    expect(await screen.findByText(/не поместится/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить' })).not.toBeInTheDocument();
  });
});

describe('ExamEditorScreen — как проходит экзамен', () => {
  it('переключатели объяснены во всплывающей подсказке и уходят в тело сохранения', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.click(
      await screen.findByRole('checkbox', { name: 'Перемешивать вопросы' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Перемешивать варианты ответов' }),
    );
    await openTip(user, 'Перемешивать вопросы');
    expect(screen.getByText('У каждого ученика свой порядок.')).toBeInTheDocument();
    await openTip(user, 'Перемешивать варианты ответов');
    expect(
      screen.getByText('Верный вариант не стоит на одном и том же месте.'),
    ).toBeInTheDocument();

    await user.click(saveButton());

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as {
      body: { blocks: { shuffle: boolean }[]; shuffleOptions: boolean };
    };
    expect(body.body.blocks[0]?.shuffle).toBe(true);
    expect(body.body.shuffleOptions).toBe(true);
  });

  it('правка лимита времени и числа попыток уходит в тело сохранения', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ timeLimitMin: 40 }));

    renderAt('/exams/x1');
    await user.clear(await screen.findByLabelText('Время, мин'));
    await user.type(screen.getByLabelText('Время, мин'), '25');
    await user.clear(screen.getByLabelText('Попыток'));
    await user.type(screen.getByLabelText('Попыток'), '3');
    await user.click(saveButton());

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as {
      body: { timeLimitMin: number; attemptsAllowed: number };
    };
    expect(body.body.timeLimitMin).toBe(25);
    expect(body.body.attemptsAllowed).toBe(3);
  });

  it('лимит времени и попытки — поля есть, подсказка лимита — во всплывающей подсказке', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ timeLimitMin: 40 }));

    renderAt('/exams/x1');

    expect(await screen.findByLabelText('Время, мин')).toHaveValue('40');
    expect(screen.getByLabelText('Попыток')).toHaveValue('2');

    await openTip(user, 'Время, мин');
    expect(screen.getByText('Пусто — без ограничения.')).toBeInTheDocument();
  });

  it('срок сдачи (ADR-0125, ADR-0138) — поле только даты, подсказка во всплывающей подсказке', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ dueAt: '2026-09-30T20:59:00Z' }));

    renderAt('/exams/x1');

    const dueDateField = await screen.findByLabelText<HTMLInputElement>('Сдать до');
    expect(dueDateField.type).toBe('date');
    expect(dueDateField.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await openTip(user, 'Сдать до');
    expect(
      screen.getByText('Пусто — без срока. Включает весь выбранный день.'),
    ).toBeInTheDocument();
  });

  it('правка срока сдачи уходит в тело сохранения ISO UTC — конец выбранного дня', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.type(await screen.findByLabelText('Сдать до'), '2026-09-30');
    await user.click(saveButton());

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as { body: { dueAt?: string } };
    // 23:59:59.999 выбранного дня, не полночь — час в поле не задан, срок
    // действует до конца дня включительно (ADR-0138).
    expect(body.body.dueAt).toMatch(/^2026-09-30T\d{2}:59:59\.999Z$/);
  });

  it('очищенный срок сдачи уходит в тело сохранения null (явный сброс)', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ dueAt: '2026-09-30T20:59:00Z' }));

    renderAt('/exams/x1');
    await user.clear(await screen.findByLabelText('Сдать до'));
    await user.click(saveButton());

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as {
      body: { dueAt?: string | null };
    };
    expect(body.body.dueAt).toBeNull();
  });

  it('«Вопросов ученику» (ADR-0082) — подсказка по числу вопросов списка, во всплывающей подсказке', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');

    expect(await screen.findByLabelText('Вопросов ученику')).toHaveValue('');
    await openTip(user, 'Вопросов ученику');
    // Акценты «2» и «случайная часть» рисует RichText через <strong>
    // (ADR-0124) — ищем по неразрывному началу подсказки, полный текст
    // сверяем через textContent родителя.
    const tip = screen.getByText(/Пусто — ученику достанутся все/);
    expect(tip.closest('div')).toHaveTextContent(
      'Пусто — ученику достанутся все 2 вопроса. Число — и каждому ' +
        'случайная часть из 2. ★ — обязательные, попадут всем.',
    );
  });

  it('заполненное «Вопросов ученику» уходит в тело сохранения', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.type(await screen.findByLabelText('Вопросов ученику'), '1');
    await user.click(saveButton());

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as {
      body: { blocks: { questionsPerAttempt?: number }[] };
    };
    expect(body.body.blocks[0]?.questionsPerAttempt).toBe(1);
  });

  // Отзыв владельца 2026-09-27: «не нашёл способа сделать вопрос
  // обязательным, хотя в объяснении это указано» — ★ теперь видна и без
  // «Вопросов ученику», иначе он не нашёл бы её тем же способом снова.
  it('«Вопросов ученику» пусто — кнопки ★/☆ всё равно видны', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Зачем придумали тайцзи?');

    expect(screen.getAllByRole('button', { name: 'Обязательный' })).toHaveLength(2);
  });

  it('★ отмечена при пустом «Вопросов ученику» — короткая подсказка под списком', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Зачем придумали тайцзи?');
    const rows = screen.getAllByRole('listitem');
    const star = within(rows[0] as HTMLElement).getByRole('button', {
      name: 'Обязательный',
    });
    expect(star).toHaveAttribute('aria-pressed', 'false');

    await user.click(star);

    expect(star).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/сработает, когда часть вопросов/)).toBeInTheDocument();
  });

  it('«Вопросов ученику» заполнено — подсказки про ★ нет', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Зачем придумали тайцзи?');
    const rows = screen.getAllByRole('listitem');
    await user.click(
      within(rows[0] as HTMLElement).getByRole('button', { name: 'Обязательный' }),
    );
    await user.type(screen.getByLabelText('Вопросов ученику'), '1');

    expect(screen.queryByText(/сработает, когда часть вопросов/)).not.toBeInTheDocument();
  });

  it('клик по ☆ отмечает вопрос обязательным — уходит в PATCH requiredItemIds', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.type(await screen.findByLabelText('Вопросов ученику'), '1');
    const rows = screen.getAllByRole('listitem');
    const star = within(rows[0] as HTMLElement).getByRole('button', {
      name: 'Обязательный',
    });
    expect(star).toHaveTextContent('☆');
    await user.click(star);

    expect(star).toHaveTextContent('★');
    expect(
      within(rows[0] as HTMLElement).getByText(/· обязательный/),
    ).toBeInTheDocument();

    await user.click(saveButton());

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as {
      body: { blocks: { requiredItemIds?: string[] }[] };
    };
    expect(body.body.blocks[0]?.requiredItemIds).toEqual(['i1']);
  });

  // requiredIds с пустым questionsPerAttempt сервер принимает и без эффекта
  // (api/src/exams/exam-blocks.ts, assertRequiredFitsPick — проверка только
  // при заданном лимите) — форма не обязана прятать их перед отправкой.
  it('★ отмечена без заполненного «Вопросов ученику» — сохранение не ломается', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Зачем придумали тайцзи?');
    const rows = screen.getAllByRole('listitem');
    await user.click(
      within(rows[0] as HTMLElement).getByRole('button', { name: 'Обязательный' }),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as {
      body: { blocks: { requiredItemIds?: string[] }[] };
    };
    expect(body.body.blocks[0]?.requiredItemIds).toEqual(['i1']);
  });
});

describe('ExamEditorScreen — подвал', () => {
  it('«Сохранить» существующего — PATCH и возврат к списку', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.click(await findSaveButton());

    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/exams/x1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('«Сохранить» нового — POST и возврат к списку', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/exam-items': BANK, '/exams': makeExam() });

    renderAt('/exams/new');
    await user.type(await screen.findByLabelText('Название'), 'Толкающие руки');
    await user.click(saveButton());

    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/exams',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('ошибка сервера показывается как есть, страница остаётся', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByLabelText('Название');
    // Форма появляется раньше, чем уйдёт запрос за вопросами (эффект после
    // коммита): отказ, поставленный в очередь сразу после формы, под
    // нагрузкой доставался этому запросу, а не сохранению — и страница
    // честно уходила к списку. Ждём кандидата из вопросов — значит, оба
    // запроса монтирования уже ушли.
    await screen.findByText('Что такое «пустая» нога?');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('В экзамене нет ни одного вопроса.', 400, 'invalid_input'),
    );
    await user.click(saveButton());

    expect(
      await screen.findByText('В экзамене нет ни одного вопроса.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });

  it('«К списку экзаменов» — ссылка наверху страницы', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.click(await screen.findByRole('link', { name: 'К списку экзаменов' }));

    expect(screen.getByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('черновик — статус со словами и кнопка «Опубликовать»', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');

    expect(await screen.findByText('Черновик')).toBeInTheDocument();
    expect(screen.getByText(/ученики его не видят/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as { body: { status: string } };
    expect(body.body.status).toBe('published');
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  // Владелец искал «Опубликовать» наверху: у экзамена на 50 вопросов подвал
  // далеко. Строка статуса стоит под названием, выше списка вопросов.
  it('«Опубликовать» стоит выше списка вопросов, не в подвале', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    const publish = await screen.findByRole('button', { name: 'Опубликовать' });
    const questions = screen.getByText(/Вопросы ·/);
    const save = saveButton();

    expect(
      publish.compareDocumentPosition(questions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      publish.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  // Список вопросов длинный (у владельца — 50 вопросов), настройки под ним
  // читались бы «подвалом»: настройки идут перед списком (отзыв владельца
  // 2026-09-21), а не после.
  it('«Как проходит экзамен» стоит выше списка вопросов', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    const flow = await screen.findByText('Как проходит экзамен');
    const questions = screen.getByText(/Вопросы ·/);

    expect(
      flow.compareDocumentPosition(questions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('«Опубликовать» без названия — та же проверка, что у сохранения', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ title: '' }));

    renderAt('/exams/x1');
    await screen.findByLabelText('Название');
    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Впишите название');
    expect(lastCallWithMethod('PATCH')).toHaveLength(0);
    expect(screen.queryByText(LIST_MARKER)).not.toBeInTheDocument();
  });

  it('опубликованный — удалить нельзя (кнопки нет ни наверху, ни внизу), короткое объяснение в подвале', async () => {
    mockExamAndBank(makeExam({ status: 'published' }));

    renderAt('/exams/x1');

    expect(await screen.findByText('Опубликован')).toBeInTheDocument();
    expect(screen.getByText(/ученики видят его в списке/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Удалить экзамен' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/можно отправить в архив/)).toBeInTheDocument();
  });

  // Архивному отдельного объяснения больше нет (ADR-0138, отзыв владельца
  // 2026-09-27) — строка статуса выше уже сказала «сданные работы остаются»,
  // повторять то же самое другими словами незачем.
  it('архивный — свой текст статуса, без отдельного объяснения про удаление', async () => {
    mockExamAndBank(makeExam({ status: 'archived' }));

    renderAt('/exams/x1');

    expect(await screen.findByText('В архиве')).toBeInTheDocument();
    expect(screen.getByText(/сданные работы остаются/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Удалить экзамен' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/могли остаться/)).not.toBeInTheDocument();
    expect(screen.queryByText(/не удалить/)).not.toBeInTheDocument();
  });

  // Удаление стоит наверху (ADR-0138) — в строке с «К списку экзаменов»,
  // раньше списка вопросов: владелец не находил кнопку в конце длинной формы.
  it('черновик — «Удалить экзамен» стоит наверху, в строке с «К списку экзаменов»', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    const back = await screen.findByRole('link', { name: 'К списку экзаменов' });
    const remove = screen.getByRole('button', { name: 'Удалить экзамен' });
    const questions = screen.getByText(/Вопросы ·/);

    expect(
      back.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      remove.compareDocumentPosition(questions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('новый экзамен — ни статуса, ни удаления', async () => {
    mockApiByPath({ '/exam-items': BANK, '/exams': makeExam() });

    renderAt('/exams/new');
    await screen.findByLabelText('Название');

    expect(screen.queryByText('Черновик')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Удалить экзамен' }),
    ).not.toBeInTheDocument();
  });

  it('удаление — с подтверждением, без слова «блок», потом возврат к списку', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.click(await screen.findByRole('button', { name: 'Удалить экзамен' }));

    expect(
      screen.getByText('Экзамен исчезнет вместе с набором вопросов. Отменить нельзя.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/exams/x1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(await screen.findByText(LIST_MARKER)).toBeInTheDocument();
  });

  it('отмена подтверждения — экзамен остаётся, запроса нет', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.click(await screen.findByRole('button', { name: 'Удалить экзамен' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(lastCallWithMethod('DELETE')).toHaveLength(0);
  });

  it('«Посмотреть глазами ученика» без правок — открывает предпросмотр, без сохранения', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.click(
      await screen.findByRole('button', { name: 'Посмотреть глазами ученика' }),
    );

    expect(await screen.findByText(PREVIEW_MARKER)).toBeInTheDocument();
    expect(lastCallWithMethod('PATCH')).toHaveLength(0);
  });

  it('новый экзамен — кнопки предпросмотра нет', async () => {
    mockApiByPath({ '/exam-items': BANK, '/exams': makeExam() });

    renderAt('/exams/new');
    await screen.findByLabelText('Название');

    expect(
      screen.queryByRole('button', { name: /глазами ученика/ }),
    ).not.toBeInTheDocument();
  });

  it('добавили вопрос и не сохранили — предпросмотр сначала сохраняет форму', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Что такое «пустая» нога?');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Сохранить и посмотреть глазами ученика',
      }),
    );

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as {
      body: { blocks: { itemIds: string[] }[] };
    };
    expect(body.body.blocks[0]?.itemIds).toEqual(['i1', 'i2', 'i3']);
    expect(await screen.findByText(PREVIEW_MARKER)).toBeInTheDocument();
  });

  it('очистили название — предпросмотр не сохраняет и не открывается, видна ошибка', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.clear(await screen.findByLabelText('Название'));
    await user.click(
      await screen.findByRole('button', {
        name: 'Сохранить и посмотреть глазами ученика',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Впишите название экзамена.',
    );
    expect(lastCallWithMethod('PATCH')).toHaveLength(0);
    expect(screen.queryByText(PREVIEW_MARKER)).not.toBeInTheDocument();
  });
});

// Read-after-write (CLAUDE.md «Тесты»): создали вопрос прямо в редакторе —
// он должен появиться в списке экзамена без второго похода за списком
// вопросов (ADR-0040).
describe('ExamEditorScreen — новый вопрос (ADR-0040)', () => {
  it('заполнил и сохранил — POST /exam-items, вопрос сразу в списке экзамена', async () => {
    const user = userEvent.setup();
    const exam = makeExam({ blocks: [] });
    const created = makeItem({
      id: 'new1',
      kind: 'text',
      prompt: 'Как дышать в стойке?',
    });
    mockedApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/exams/x1') return Promise.resolve(exam);
      if (path === '/exam-items' && init?.method === 'POST') {
        return Promise.resolve(created);
      }
      if (path.startsWith('/exam-items')) return Promise.resolve(BANK);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderAt('/exams/x1');
    await user.click(await screen.findByRole('button', { name: 'Новый вопрос' }));
    // Фокус сразу в формулировке — без лишнего клика (отзыв владельца 2026-09-27).
    expect(screen.getByLabelText('Формулировка')).toHaveFocus();
    await user.type(screen.getByLabelText('Формулировка'), 'Как дышать в стойке?');
    await user.click(screen.getByRole('button', { name: 'Добавить в экзамен' }));

    await waitFor(() => expect(lastCallWithMethod('POST')).toHaveLength(1));
    expect(await screen.findByText('Как дышать в стойке?')).toBeInTheDocument();
    expect(screen.getByText('Вопросы · 1')).toBeInTheDocument();
    // Форма создания закрылась сама — поиск вопросов снова на месте.
    expect(screen.getByLabelText('Найти вопрос — по тексту')).toBeInTheDocument();
  });

  it('«Отменить» закрывает форму без запроса — поиск вопросов снова на месте', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ blocks: [] }));

    renderAt('/exams/x1');
    await user.click(await screen.findByRole('button', { name: 'Новый вопрос' }));
    await screen.findByLabelText('Формулировка');
    await user.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(lastCallWithMethod('POST')).toHaveLength(0);
    expect(screen.getByLabelText('Найти вопрос — по тексту')).toBeInTheDocument();
  });

  it('тип с вариантами — вопрос уходит с текстом и вариантами, верный отмечен', async () => {
    const user = userEvent.setup();
    const exam = makeExam({ blocks: [] });
    const created = makeItem({ id: 'new2', kind: 'single', prompt: 'Сколько форм?' });
    mockedApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/exams/x1') return Promise.resolve(exam);
      if (path === '/exam-items' && init?.method === 'POST') {
        return Promise.resolve(created);
      }
      if (path.startsWith('/exam-items')) return Promise.resolve(BANK);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderAt('/exams/x1');
    await user.click(await screen.findByRole('button', { name: 'Новый вопрос' }));
    await user.click(await screen.findByLabelText('Один правильный вариант'));
    await user.type(screen.getByLabelText('Формулировка'), 'Сколько форм?');
    await user.click(screen.getByRole('button', { name: 'Добавить вариант' }));
    await user.click(screen.getByRole('button', { name: 'Добавить вариант' }));
    await user.type(screen.getByLabelText('Текст варианта 1'), '24');
    await user.type(screen.getByLabelText('Текст варианта 2'), '108');
    await user.click(screen.getByLabelText('Верный вариант 1'));
    await user.click(screen.getByRole('button', { name: 'Добавить в экзамен' }));

    await waitFor(() => expect(lastCallWithMethod('POST')).toHaveLength(1));
    const body = lastCallWithMethod('POST')[0]?.[1] as {
      body: { options: { text: string; correct: boolean }[] };
    };
    expect(body.body.options).toEqual([
      { id: undefined, text: '24', correct: true, imageId: undefined },
      { id: undefined, text: '108', correct: false, imageId: undefined },
    ]);
    expect(await screen.findByText('Сколько форм?')).toBeInTheDocument();
  });
});

// Отзыв владельца 2026-09-27: «нельзя отредактировать вопрос после
// добавления, особенно важно когда выбираешь существующий — нельзя даже
// посмотреть, какие там варианты».
describe('ExamEditorScreen — раскрыть и изменить вопрос', () => {
  function itemWithOptions(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
    return makeItem({
      id: 'i1',
      kind: 'single',
      prompt: 'Зачем придумали тайцзи?',
      options: [
        { id: 'o1', text: '24 формы', correct: true },
        { id: 'o2', text: '108 форм', correct: false },
      ],
      ...overrides,
    });
  }

  it('раскрыл строку выбранного вопроса — видно варианты и отметку верного', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam(), [itemWithOptions(), BANK[1] as ExamItemDto]);

    renderAt('/exams/x1');
    const prompt = await screen.findByRole('button', {
      name: 'Зачем придумали тайцзи?',
    });
    expect(prompt).toHaveAttribute('aria-expanded', 'false');

    await user.click(prompt);

    expect(prompt).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('24 формы')).toBeInTheDocument();
    expect(screen.getByText('108 форм')).toBeInTheDocument();
  });

  it('раскрыл строку кандидата в поиске — видно варианты до «Добавить»', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ blocks: [] }), [itemWithOptions()]);

    renderAt('/exams/x1');
    const prompt = await screen.findByRole('button', {
      name: 'Зачем придумали тайцзи?',
    });
    await user.click(prompt);

    expect(screen.getByText('24 формы')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
  });

  it('«Изменить» открывает заполненную форму; PATCH — read-after-write без перезапроса', async () => {
    const user = userEvent.setup();
    const original = itemWithOptions();
    const updated = { ...original, prompt: 'Зачем нужна форма?' };
    mockedApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/exams/x1') return Promise.resolve(makeExam());
      if (path === '/exam-items/i1' && init?.method === 'PATCH') {
        return Promise.resolve(updated);
      }
      if (path.startsWith('/exam-items')) {
        return Promise.resolve([original, BANK[1] as ExamItemDto]);
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderAt('/exams/x1');
    await user.click(
      await screen.findByRole('button', { name: 'Зачем придумали тайцзи?' }),
    );
    await user.click(screen.getByRole('button', { name: 'Изменить' }));

    const promptField = screen.getByLabelText('Формулировка');
    expect(promptField).toHaveValue('Зачем придумали тайцзи?');
    expect(promptField).toHaveFocus();
    expect(
      screen.getByText('Изменения попадут во все экзамены с этим вопросом.'),
    ).toBeInTheDocument();
    // Тип ответа при правке не меняется — переключателей нет, только строка.
    expect(
      screen.queryByRole('radio', { name: 'Один правильный вариант' }),
    ).not.toBeInTheDocument();

    await user.clear(promptField);
    await user.type(promptField, 'Зачем нужна форма?');
    await user.click(screen.getByRole('button', { name: 'Сохранить вопрос' }));

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    expect(lastCallWithMethod('PATCH')[0]?.[0]).toBe('/exam-items/i1');
    const body = lastCallWithMethod('PATCH')[0]?.[1] as { body: { prompt: string } };
    expect(body.body.prompt).toBe('Зачем нужна форма?');

    // Строка сразу показывает новую формулировку, старой не осталось.
    expect(await screen.findByText('Зачем нужна форма?')).toBeInTheDocument();
    expect(screen.queryByText('Зачем придумали тайцзи?')).not.toBeInTheDocument();
    // Раскрытие по-прежнему показывает варианты — уже у обновлённой записи.
    const newPrompt = screen.getByRole('button', { name: 'Зачем нужна форма?' });
    expect(newPrompt).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('24 формы')).toBeInTheDocument();
  });

  it('«Отменить» в правке закрывает форму и возвращает «Новый вопрос»', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam(), [itemWithOptions(), BANK[1] as ExamItemDto]);

    renderAt('/exams/x1');
    await user.click(
      await screen.findByRole('button', { name: 'Зачем придумали тайцзи?' }),
    );
    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    expect(
      screen.queryByRole('button', { name: 'Новый вопрос' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отменить' }));

    expect(screen.queryByLabelText('Формулировка')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Новый вопрос' })).toBeInTheDocument();
  });

  it('открыт «Новый вопрос» — «Изменить» у строк не видно (одна форма разом)', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam(), [itemWithOptions(), BANK[1] as ExamItemDto]);

    renderAt('/exams/x1');
    await user.click(await screen.findByRole('button', { name: 'Новый вопрос' }));
    await user.click(
      await screen.findByRole('button', { name: 'Зачем придумали тайцзи?' }),
    );

    expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
  });

  it('открыта правка строки — «Новый вопрос» и поиск скрыты', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam(), [itemWithOptions(), BANK[1] as ExamItemDto]);

    renderAt('/exams/x1');
    await user.click(
      await screen.findByRole('button', { name: 'Зачем придумали тайцзи?' }),
    );
    await user.click(screen.getByRole('button', { name: 'Изменить' }));

    expect(
      screen.queryByRole('button', { name: 'Новый вопрос' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Найти вопрос — по тексту')).not.toBeInTheDocument();
  });
});

describe('ExamEditorScreen — черновик (ADR-0052)', () => {
  it('ушли со страницы и вернулись — черновик на месте, видна строка о нём', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    // «Ушли со страницы» — размонтирование: сама навигация здесь не под
    // тестом, черновик обязан пережить именно уход формы из дерева (ровно
    // это стирало состояние до ADR-0052).
    const first = renderAt('/exams/x1');
    await user.clear(await screen.findByLabelText('Название'));
    await user.type(screen.getByLabelText('Название'), 'Набранное, но не сохранённое');
    first.unmount();

    renderAt('/exams/x1');

    expect(await screen.findByLabelText('Название')).toHaveValue(
      'Набранное, но не сохранённое',
    );
    expect(
      screen.getByText('Вернули то, что вы не сохранили в прошлый раз.'),
    ).toBeInTheDocument();
  });

  it('неудачное сохранение прокручивает к первому сообщению об ошибке', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    mockExamAndBank(makeExam({ title: '' }));

    renderAt('/exams/x1');
    await screen.findByLabelText('Название');
    await user.click(saveButton());

    // Прокрутка отложена на микротакт (scrollToFirstAlertSoon) — ждём её,
    // а не проверяем сразу же после клика.
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  });
});

// Заметка «пока не сохранили» (ADR-0138, отзыв владельца 2026-09-27):
// новый экзамен выглядел пустым и было страшно уйти со страницы, не зная,
// что набранное уже сохраняется черновиком в этом браузере.
describe('ExamEditorScreen — заметка про несохранённые правки', () => {
  it('новый экзамен — заметка видна сразу, до первой правки', async () => {
    mockApiByPath({ '/exam-items': BANK, '/exams': makeExam() });

    renderAt('/exams/new');
    await screen.findByLabelText('Название');

    expect(
      screen.getByText('Пока не сохранили, набранное хранится на этом устройстве.'),
    ).toBeInTheDocument();
  });

  it('существующий экзамен без правок — заметки нет', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByLabelText('Название');

    expect(
      screen.queryByText('Пока не сохранили, набранное хранится на этом устройстве.'),
    ).not.toBeInTheDocument();
  });

  it('правка существующего экзамена — заметка появляется', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.type(await screen.findByLabelText('Название'), '!');

    expect(
      screen.getByText('Пока не сохранили, набранное хранится на этом устройстве.'),
    ).toBeInTheDocument();
  });
});
