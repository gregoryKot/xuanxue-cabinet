// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts») — ExamSheet сам
// грузит банк вопросов через useExamItems (общий с exam-items).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateExamInput,
  ExamDto,
  ExamItemDto,
  UpdateExamInput,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { ExamSheet } from './ExamSheet';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

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

function makeBankItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'text',
    prompt: 'Опишите принцип песчинки',
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

interface RenderSheetOverrides {
  onCreate?: (input: CreateExamInput) => Promise<void>;
  onUpdate?: (id: string, input: UpdateExamInput) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
}

function renderSheet(exam: ExamDto | null, overrides: RenderSheetOverrides = {}) {
  const onClose = vi.fn();
  const onCreate = overrides.onCreate ?? vi.fn().mockResolvedValue(undefined);
  const onUpdate = overrides.onUpdate ?? vi.fn().mockResolvedValue(undefined);
  const onRemove = overrides.onRemove ?? vi.fn().mockResolvedValue(undefined);

  render(
    <MemoryRouter initialEntries={['/exams']}>
      <ExamSheet
        exam={exam}
        onClose={onClose}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />
    </MemoryRouter>,
  );

  return { onClose, onCreate, onUpdate, onRemove };
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('ExamSheet — диалог', () => {
  it('role=dialog, заголовком подписан, заголовок в фокусе', () => {
    mockedApiFetch.mockResolvedValue([]);
    renderSheet(makeExam());

    const dialog = screen.getAllByRole('dialog')[0] as HTMLElement;
    const heading = screen.getByRole('heading', { name: 'Экзамен' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(heading).toHaveFocus();
  });
});

describe('ExamSheet — создание', () => {
  it('название + блок с вопросом — POST с телом, включающим блок', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([makeBankItem()]);
    const { onCreate } = renderSheet(null);

    await user.type(screen.getByLabelText('Название'), 'Новый экзамен');
    await user.click(screen.getByRole('button', { name: 'Добавить блок' }));
    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));
    await waitFor(() => screen.getByRole('button', { name: 'Добавить' }));
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Новый экзамен',
        blocks: [expect.objectContaining({ itemIds: ['i1'] })],
      }),
    );
  });

  it('заполнить описание, уровень, лимит времени и попытки — уходят в тело запроса', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);
    const { onCreate } = renderSheet(null);

    await user.type(screen.getByLabelText('Название'), 'Экзамен');
    await user.type(screen.getByLabelText('Описание'), 'Итоговая проверка формы');
    await user.type(screen.getByLabelText('Уровень'), 'начальный');
    await user.clear(screen.getByLabelText('Лимит времени, минут'));
    await user.type(screen.getByLabelText('Лимит времени, минут'), '40');
    await user.clear(screen.getByLabelText('Число попыток'));
    await user.type(screen.getByLabelText('Число попыток'), '2');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Итоговая проверка формы',
        level: 'начальный',
        timeLimitMin: 40,
        attemptsAllowed: 2,
      }),
    );
  });

  it('пустое название — сохранение не проходит', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);
    const { onCreate } = renderSheet(null);

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(/название/)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe('ExamSheet — правка', () => {
  it('поля предзаполнены существующей формой', () => {
    mockedApiFetch.mockResolvedValue([]);
    renderSheet(
      makeExam({
        title: 'Форма Б',
        description: 'Описание Б',
        level: 'начальный',
        timeLimitMin: 30,
      }),
    );

    expect(screen.getByLabelText('Название')).toHaveValue('Форма Б');
    expect(screen.getByLabelText('Описание')).toHaveValue('Описание Б');
    expect(screen.getByLabelText('Уровень')).toHaveValue('начальный');
    expect(screen.getByLabelText('Лимит времени, минут')).toHaveValue('30');
  });

  it('правка названия — PATCH с новым значением', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);
    const { onUpdate } = renderSheet(makeExam());

    await user.clear(screen.getByLabelText('Название'));
    await user.type(screen.getByLabelText('Название'), 'Изменённое название');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onUpdate).toHaveBeenCalledWith(
      'x1',
      expect.objectContaining({ title: 'Изменённое название' }),
    );
  });

  it('сбой сохранения — текст сервера на листе', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);
    const onUpdate = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'В блоках 2 вопроса не из опубликованного банка.',
          400,
          'invalid_input',
        ),
      );
    renderSheet(makeExam(), { onUpdate });

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'В блоках 2 вопроса не из опубликованного банка.',
    );
  });
});

describe('ExamSheet — статус и удаление', () => {
  it('новая форма — блока статуса и удаления нет', () => {
    mockedApiFetch.mockResolvedValue([]);
    renderSheet(null);

    expect(screen.queryByText(/Статус:/)).not.toBeInTheDocument();
  });

  it('черновик — есть «Удалить», клик зовёт onRemove', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);
    const { onRemove } = renderSheet(makeExam({ status: 'draft' }));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(onRemove).toHaveBeenCalledWith('x1');
  });

  it('сбой удаления — лист остаётся открытым с текстом ошибки', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);
    const onRemove = vi
      .fn()
      .mockRejectedValue(new ApiError('Удалить можно только черновик.', 409, 'conflict'));
    renderSheet(makeExam({ status: 'draft' }), { onRemove });

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Удалить можно только черновик.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('сбой смены статуса — лист остаётся открытым с текстом ошибки', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);
    const onUpdate = vi
      .fn()
      .mockRejectedValue(
        new ApiError('В форме нет ни одного вопроса.', 400, 'invalid_input'),
      );
    renderSheet(makeExam({ status: 'draft' }), { onUpdate });

    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'В форме нет ни одного вопроса.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('опубликована — кнопки «Удалить» нет, есть объяснение про попытки учеников', () => {
    mockedApiFetch.mockResolvedValue([]);
    renderSheet(makeExam({ status: 'published' }));

    expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument();
    expect(screen.getByText(/попытки учеников/)).toBeInTheDocument();
  });

  it('черновик — «Опубликовать» шлёт PATCH со status: published', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);
    const { onUpdate } = renderSheet(makeExam({ status: 'draft' }));

    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith('x1', { status: 'published' }),
    );
  });
});

describe('ExamSheet — публикация черновика из пикера', () => {
  // Баг с прода: учитель завёл и опубликовал вопрос на «Вопросах» — а форма
  // экзамена его не видела, потому что новый вопрос всегда черновик.
  // Публикация из пикера — тот же PATCH .../exam-items/:id со
  // { status: 'published' }, что и на экране «Вопросы» (useExamItems.update),
  // и после него банк перечитывается (read-after-write, CLAUDE.md «Тесты»):
  // вопрос переезжает из группы черновиков в кандидаты и становится доступен
  // для «Добавить».
  it('«Опубликовать» шлёт PATCH со status: published, вопрос становится кандидатом', async () => {
    const user = userEvent.setup();
    const draft = makeBankItem({ id: 'i1', status: 'draft', prompt: 'Стойка мабу' });
    mockedApiFetch.mockResolvedValueOnce([draft]);
    renderSheet(makeExam());

    await user.click(screen.getByRole('button', { name: 'Добавить блок' }));
    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));
    await waitFor(() => screen.getByText('Стойка мабу'));
    expect(screen.queryByRole('button', { name: 'Добавить' })).not.toBeInTheDocument();

    mockedApiFetch.mockResolvedValueOnce({ ...draft, status: 'published' });
    mockedApiFetch.mockResolvedValueOnce([{ ...draft, status: 'published' }]);

    // Экран экзамена тоже черновик и своей кнопкой «Опубликовать»
    // (ExamStatusControls) — берём кнопку именно у строки вопроса в пикере.
    const draftRow = screen.getByText('Стойка мабу').closest('li') as HTMLElement;
    await user.click(within(draftRow).getByRole('button', { name: 'Опубликовать' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/exam-items/i1', {
      method: 'PATCH',
      body: { status: 'published' },
    });
    expect(await screen.findByRole('button', { name: 'Добавить' })).toBeInTheDocument();
  });
});

describe('ExamSheet — предпросмотр', () => {
  it('открывает предпросмотр поверх листа, название формы видно там же', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);
    renderSheet(makeExam({ title: 'Форма для показа' }));

    await user.click(screen.getByRole('button', { name: 'Посмотреть глазами ученика' }));

    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(2);
    const preview = within(dialogs[1] as HTMLElement);
    expect(
      preview.getByRole('heading', { name: 'Форма для показа' }),
    ).toBeInTheDocument();
  });

  it('«Закрыть» в предпросмотре возвращает к листу формы, лист остаётся', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue([]);
    renderSheet(makeExam());

    await user.click(screen.getByRole('button', { name: 'Посмотреть глазами ученика' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);

    const preview = within(screen.getAllByRole('dialog')[1] as HTMLElement);
    await user.click(preview.getByRole('button', { name: 'Закрыть' }));

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('ExamSheet — предпросмотр пока банк ещё грузится', () => {
  it('банк не пришёл — предпросмотр открывается с пустым списком вопросов, не падает', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderSheet(makeExam());

    await user.click(screen.getByRole('button', { name: 'Посмотреть глазами ученика' }));

    const preview = within(screen.getAllByRole('dialog')[1] as HTMLElement);
    expect(preview.getByText(/Загружаем вопросы/)).toBeInTheDocument();
  });
});

describe('ExamSheet — сбой загрузки банка вопросов', () => {
  it('баннер ошибки с кнопкой повтора внутри блоков', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );
    renderSheet(makeExam());

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockedApiFetch.mockResolvedValueOnce([]);
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
