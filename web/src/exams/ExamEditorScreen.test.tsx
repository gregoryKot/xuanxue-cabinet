// Страница редактора экзамена целиком: загрузка, поля, список вопросов,
// поиск по банку, настройки прохождения, подвал (ADR-0033). Мок сети — по
// префиксу пути (test-support/apiFetchMock.ts); `/exams/x1` стоит раньше
// `/exams`, mockApiByPath матчит первым подходящим префиксом.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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

const LIST_MARKER = 'Здесь список экзаменов';

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
    tags: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const BANK = [
  makeItem({ id: 'i1', prompt: 'Зачем придумали тайцзи?', tags: ['история'] }),
  makeItem({ id: 'i2', prompt: 'Жить здорово?', kind: 'text', tags: ['дыхание'] }),
  makeItem({ id: 'i3', prompt: 'Что такое «пустая» нога?', tags: ['стойки'] }),
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/exams" element={<p>{LIST_MARKER}</p>} />
        <Route path="/exam-items" element={<p>Банк вопросов</p>} />
        <Route path="/exams/new" element={<ExamEditorScreen />} />
        <Route path="/exams/:examId" element={<ExamEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockExamAndBank(exam: ExamDto, bank: ExamItemDto[] = BANK) {
  mockApiByPath({ '/exams/x1': exam, '/exam-items': bank, '/exams': exam });
}

function lastCallWithMethod(method: string) {
  return mockedApiFetch.mock.calls.filter(
    (call) => (call[1] as { method?: string } | undefined)?.method === method,
  );
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
  it('поля заполнены из ответа сервера, подпись уровня честно объяснена', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');

    expect(await screen.findByLabelText('Название')).toHaveValue('Первый уровень');
    expect(screen.getByLabelText('Описание для ученика')).toHaveValue(
      'Что вы умеете после первого года',
    );
    expect(screen.getByLabelText('Подпись уровня')).toHaveValue('первый уровень');
    expect(screen.getByText(/Ни на что больше не влияет/)).toBeInTheDocument();
    expect(screen.queryByText(/доступна всем уровням/)).not.toBeInTheDocument();
  });

  it('правки полей уходят в тело сохранения', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.clear(await screen.findByLabelText('Описание для ученика'));
    await user.type(screen.getByLabelText('Описание для ученика'), 'Новое описание');
    await user.clear(screen.getByLabelText('Подпись уровня'));
    await user.type(screen.getByLabelText('Подпись уровня'), 'второй уровень');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

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
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Впишите название');
    expect(lastCallWithMethod('PATCH')).toHaveLength(0);
  });
});

describe('ExamEditorScreen — список вопросов', () => {
  it('вопросы пронумерованы, под каждым тип и теги', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');

    expect(await screen.findByText('Вопросы · 2')).toBeInTheDocument();
    // Ждём банк: формулировки и строку «тип · теги» подставляет он.
    await screen.findByText('Один правильный вариант · история');
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
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

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

  it('«Убрать из экзамена» убирает вопрос и возвращает его в банк', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await screen.findByText('Зачем придумали тайцзи?');
    const rows = screen.getAllByRole('listitem');
    await user.click(
      within(rows[0] as HTMLElement).getByRole('button', { name: 'Убрать из экзамена' }),
    );

    expect(screen.getByText('Вопросы · 1')).toBeInTheDocument();
    // Убранный вопрос снова доступен в банке: было одно «Добавить», стало два.
    expect(screen.getAllByRole('button', { name: 'Добавить' })).toHaveLength(2);
  });

  it('вопросов ещё нет — честный текст, а не пустота', async () => {
    mockExamAndBank(makeExam({ blocks: [] }));

    renderAt('/exams/x1');

    expect(await screen.findByText(/Вопросов пока нет/)).toBeInTheDocument();
  });

  it('вопрос экзамена не найден в банке — честный текст вместо молчания', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as { body: { blocks: unknown[] } };
    expect(body.body.blocks).toEqual([
      { id: 'b1', title: '', itemIds: ['i1', 'i2'], shuffle: true },
    ]);
  });
});

describe('ExamEditorScreen — поиск по банку', () => {
  it('поиск стоит на месте сразу, кнопки-переключателя нет', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');

    expect(
      await screen.findByLabelText('Найти вопрос в банке — по тексту или тегу'),
    ).toBeInTheDocument();
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

  it('поиск по тегу оставляет подходящие вопросы', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ blocks: [] }));

    renderAt('/exams/x1');
    await screen.findByText('Что такое «пустая» нога?');
    await user.type(
      screen.getByLabelText('Найти вопрос в банке — по тексту или тегу'),
      'стойки',
    );

    expect(screen.getAllByRole('button', { name: 'Добавить' })).toHaveLength(1);
    expect(screen.getByText('Что такое «пустая» нога?')).toBeInTheDocument();
  });

  it('по запросу ничего не нашлось — честный текст', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam({ blocks: [] }));

    renderAt('/exams/x1');
    await screen.findByText('Что такое «пустая» нога?');
    await user.type(
      screen.getByLabelText('Найти вопрос в банке — по тексту или тегу'),
      'веник',
    );

    expect(screen.getByText('По этому запросу ничего не нашлось.')).toBeInTheDocument();
  });

  it('все вопросы банка уже в экзамене — так и сказано', async () => {
    mockExamAndBank(
      makeExam({
        blocks: [{ id: 'b1', title: '', itemIds: ['i1', 'i2', 'i3'], shuffle: false }],
      }),
    );

    renderAt('/exams/x1');

    expect(
      await screen.findByText('Все вопросы банка уже в экзамене.'),
    ).toBeInTheDocument();
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

  it('в банке нет опубликованных вопросов — честный текст и ссылка на банк', async () => {
    mockExamAndBank(makeExam({ blocks: [] }), [
      makeItem({ id: 'i9', status: 'draft', prompt: 'Спрятанный вопрос' }),
    ]);

    renderAt('/exams/x1');

    expect(await screen.findByText(/В банке пока нет вопросов/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть банк вопросов' })).toHaveAttribute(
      'href',
      '/exam-items',
    );
    expect(screen.queryByText('Спрятанный вопрос')).not.toBeInTheDocument();
  });

  it('банк не загрузился — баннер, повтор снова просит банк', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/exams/x1': makeExam(),
      '/exam-items': new ApiError('Банк недоступен', 503, 'unknown'),
    });

    renderAt('/exams/x1');
    expect(await screen.findByText('Банк недоступен')).toBeInTheDocument();

    mockExamAndBank(makeExam());
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Что такое «пустая» нога?')).toBeInTheDocument();
  });

  it('вопросов уже предельно много — вместо кандидатов объяснение', async () => {
    const many = Array.from({ length: 50 }, (_, i) => `i${i + 100}`);
    mockExamAndBank(
      makeExam({ blocks: [{ id: 'b1', title: '', itemIds: many, shuffle: false }] }),
    );

    renderAt('/exams/x1');

    expect(await screen.findByText(/не поместится/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить' })).not.toBeInTheDocument();
  });
});

describe('ExamEditorScreen — как проходит экзамен', () => {
  it('переключатели объяснены и уходят в тело сохранения', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.click(
      await screen.findByRole('checkbox', { name: 'Перемешивать вопросы' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Перемешивать варианты ответов' }),
    );
    expect(screen.getByText('У каждого ученика свой порядок')).toBeInTheDocument();
    expect(
      screen.getByText('Верный вариант не стоит на одном и том же месте'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

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
    await user.clear(await screen.findByLabelText('Лимит времени, минут'));
    await user.type(screen.getByLabelText('Лимит времени, минут'), '25');
    await user.clear(screen.getByLabelText('Попыток у ученика'));
    await user.type(screen.getByLabelText('Попыток у ученика'), '3');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(lastCallWithMethod('PATCH')).toHaveLength(1));
    const body = lastCallWithMethod('PATCH')[0]?.[1] as {
      body: { timeLimitMin: number; attemptsAllowed: number };
    };
    expect(body.body.timeLimitMin).toBe(25);
    expect(body.body.attemptsAllowed).toBe(3);
  });

  it('лимит времени и попытки — поля с честной подсказкой', async () => {
    mockExamAndBank(makeExam({ timeLimitMin: 40 }));

    renderAt('/exams/x1');

    expect(await screen.findByLabelText('Лимит времени, минут')).toHaveValue('40');
    expect(screen.getByLabelText('Попыток у ученика')).toHaveValue('2');
    expect(screen.getByText('Пусто — без ограничения.')).toBeInTheDocument();
  });
});

describe('ExamEditorScreen — подвал', () => {
  it('«Сохранить» существующего — PATCH и возврат к списку', async () => {
    const user = userEvent.setup();
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');
    await user.click(await screen.findByRole('button', { name: 'Сохранить' }));

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
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

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
    // Форма появляется раньше, чем уйдёт запрос банка (эффект после
    // коммита): отказ, поставленный в очередь сразу после формы, под
    // нагрузкой доставался запросу банка, а не сохранению — и страница
    // честно уходила к списку. Ждём кандидата из банка — значит, оба
    // запроса монтирования уже ушли.
    await screen.findByText('Что такое «пустая» нога?');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('В экзамене нет ни одного вопроса.', 400, 'invalid_input'),
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

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

  it('опубликованный — удалить нельзя, вместо кнопки объяснение', async () => {
    mockExamAndBank(makeExam({ status: 'published' }));

    renderAt('/exams/x1');

    expect(await screen.findByText('Опубликован')).toBeInTheDocument();
    expect(screen.getByText(/ученики видят его в списке/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Удалить экзамен' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Отправьте его в архив/)).toBeInTheDocument();
  });

  it('архивный — свой текст статуса и своё объяснение вместо удаления', async () => {
    mockExamAndBank(makeExam({ status: 'archived' }));

    renderAt('/exams/x1');

    expect(await screen.findByText('В архиве')).toBeInTheDocument();
    expect(screen.getByText(/сданные работы остаются/)).toBeInTheDocument();
    expect(screen.getByText(/могли остаться ссылки в попытках/)).toBeInTheDocument();
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

  it('«Посмотреть глазами ученика» — ссылка на страницу предпросмотра', async () => {
    mockExamAndBank(makeExam());

    renderAt('/exams/x1');

    expect(
      await screen.findByRole('link', { name: 'Посмотреть глазами ученика' }),
    ).toHaveAttribute('href', '/exams/x1/preview');
  });

  it('новый экзамен — ссылки на предпросмотр нет', async () => {
    mockApiByPath({ '/exam-items': BANK, '/exams': makeExam() });

    renderAt('/exams/new');
    await screen.findByLabelText('Название');

    expect(
      screen.queryByRole('link', { name: 'Посмотреть глазами ученика' }),
    ).not.toBeInTheDocument();
  });
});
