import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import { ExamBlocksField } from './ExamBlocksField';
import type { ExamBlockDraft } from './examBlocksInput';

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'text',
    prompt: 'Вопрос про стойку',
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

function renderField(
  blocks: ExamBlockDraft[],
  overrides: Partial<{
    bankItems: ExamItemDto[] | null;
    bankLoading: boolean;
    bankError: string | null;
    onPublishItem: (itemId: string) => void;
  }> = {},
) {
  const onChange = vi.fn();
  const onPublishItem = overrides.onPublishItem ?? vi.fn();
  render(
    <ExamBlocksField
      blocks={blocks}
      onChange={onChange}
      bankItems={overrides.bankItems ?? []}
      bankLoading={overrides.bankLoading ?? false}
      bankError={overrides.bankError ?? null}
      onRetryBank={vi.fn()}
      onPublishItem={onPublishItem}
    />,
  );
  return { onChange, onPublishItem };
}

describe('ExamBlocksField — блоки', () => {
  it('без блоков — только кнопка «Добавить блок»', () => {
    renderField([]);
    expect(screen.getByRole('button', { name: 'Добавить блок' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Название блока/)).not.toBeInTheDocument();
  });

  it('«Добавить блок» добавляет пустой блок', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([]);

    await user.click(screen.getByRole('button', { name: 'Добавить блок' }));

    expect(onChange).toHaveBeenCalledWith([
      { title: '', itemIds: [], shuffle: false, required: false },
    ]);
  });

  it('переименование блока', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    const { onChange } = renderField(blocks);

    await user.type(screen.getByLabelText('Название блока 1'), 'Т');

    expect(onChange).toHaveBeenCalledWith([
      { title: 'Т', itemIds: [], shuffle: false, required: false },
    ]);
  });

  it('«Убрать блок» удаляет нужный блок', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { id: 'b1', title: 'Первый', itemIds: [], shuffle: false, required: false },
    ];
    const { onChange } = renderField(blocks);

    await user.click(screen.getByRole('button', { name: 'Убрать блок' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('галочки «перемешивать»/«обязателен» меняют состояние блока', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    const { onChange } = renderField(blocks);

    await user.click(screen.getByLabelText('Перемешивать вопросы'));
    expect(onChange).toHaveBeenCalledWith([
      { title: '', itemIds: [], shuffle: true, required: false },
    ]);

    await user.click(screen.getByLabelText('Блок обязателен'));
    expect(onChange).toHaveBeenCalledWith([
      { title: '', itemIds: [], shuffle: false, required: true },
    ]);
  });
});

describe('ExamBlocksField — добавление вопроса', () => {
  it('«Добавить вопрос» открывает пикер, клик по вопросу добавляет его в блок', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    const { onChange } = renderField(blocks, { bankItems: [makeItem()] });

    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(onChange).toHaveBeenCalledWith([
      { title: '', itemIds: ['i1'], shuffle: false, required: false },
    ]);
  });

  it('уже добавленный вопрос — в пикере показан как «Добавлено» и не кликабелен', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: ['i1'], shuffle: false, required: false },
    ];
    renderField(blocks, { bankItems: [makeItem({ id: 'i1' })] });

    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));

    const addedButton = screen.getByRole('button', { name: 'Добавлено' });
    expect(addedButton).toBeDisabled();
  });

  it('фильтр по тегу в пикере сужает список кандидатов', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    renderField(blocks, {
      bankItems: [
        makeItem({ id: 'i1', prompt: 'С тегом', tags: ['ян'] }),
        makeItem({ id: 'i2', prompt: 'Без тега', tags: [] }),
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));
    expect(screen.getByText('С тегом')).toBeInTheDocument();
    expect(screen.getByText('Без тега')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Фильтр по тегу'), 'ян');

    expect(screen.getByText('С тегом')).toBeInTheDocument();
    expect(screen.queryByText('Без тега')).not.toBeInTheDocument();
  });

  it('тег без совпадений среди опубликованных — другой текст, чем «вопросов вовсе нет»', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    renderField(blocks, { bankItems: [makeItem({ tags: ['теория'] })] });

    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));
    await user.type(screen.getByLabelText('Фильтр по тегу'), 'нет такого тега');

    expect(
      screen.getByText(/По этому тегу опубликованных вопросов нет/),
    ).toBeInTheDocument();
  });

  // Баг с прода: учитель завёл вопрос на «Вопросах», он остался черновиком
  // (ExamItemRecord.status default: 'draft'), и пикер конструктора экзамена
  // писал «Опубликованных вопросов пока нет» — звучало так, будто вопросов
  // нет вовсе, хотя один только что создан. Теперь черновик виден в
  // приглушённой группе под кандидатами, подписан, что в форму не попадёт, и
  // не предлагается как кандидат для «Добавить».
  it('черновик виден в пикере отдельной группой и помечен, что в форму не попадёт', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    renderField(blocks, {
      bankItems: [makeItem({ id: 'i1', status: 'draft', prompt: 'Черновик' })],
    });

    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));

    expect(screen.getByText('Черновик')).toBeInTheDocument();
    expect(
      screen.getByText(/в форму не попадут, пока вы их не опубликуете/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить' })).not.toBeInTheDocument();
  });

  it('пустой список кандидатов, но черновик есть — сообщение называет число черновиков', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    renderField(blocks, {
      bankItems: [makeItem({ id: 'i1', status: 'draft', prompt: 'Черновик' })],
    });

    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));

    expect(
      screen.getByText(
        'Опубликованных вопросов нет: 1 черновик ждёт публикации ниже. Опубликуйте — и они попадут в форму.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Опубликованных вопросов пока нет/),
    ).not.toBeInTheDocument();
  });

  it('банк совсем пуст (ни опубликованных, ни черновиков) — прежний текст', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    renderField(blocks, { bankItems: [] });

    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));

    expect(screen.getByText(/Опубликованных вопросов пока нет/)).toBeInTheDocument();
  });

  it('«Опубликовать» у черновика в пикере зовёт onPublishItem с id вопроса', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    const { onPublishItem } = renderField(blocks, {
      bankItems: [makeItem({ id: 'i1', status: 'draft', prompt: 'Черновик' })],
    });

    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));
    await user.click(screen.getByRole('button', { name: 'Опубликовать' }));

    expect(onPublishItem).toHaveBeenCalledWith('i1');
  });

  it('после публикации вопрос переезжает в кандидаты и доступен для добавления', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    const draft = makeItem({ id: 'i1', status: 'draft', prompt: 'Стойка мабу' });
    const { rerender } = render(
      <ExamBlocksField
        blocks={blocks}
        onChange={vi.fn()}
        bankItems={[draft]}
        bankLoading={false}
        bankError={null}
        onRetryBank={vi.fn()}
        onPublishItem={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));
    expect(screen.queryByRole('button', { name: 'Добавить' })).not.toBeInTheDocument();

    // Родитель перечитал банк после update({status:'published'}) — вопрос
    // теперь опубликован (read-after-write, CLAUDE.md «Тесты»).
    rerender(
      <ExamBlocksField
        blocks={blocks}
        onChange={vi.fn()}
        bankItems={[{ ...draft, status: 'published' }]}
        bankLoading={false}
        bankError={null}
        onRetryBank={vi.fn()}
        onPublishItem={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Добавить' })).toBeInTheDocument();
  });

  // Баг с прода: учитель публикует вопрос на «Вопросах», идёт собирать
  // экзамен — пикер успевает открыться до ответа сервера (медленная сеть,
  // «холодный старт») и на мгновение показывает «Опубликованных вопросов
  // пока нет», хотя вопрос есть и просто ещё не пришёл. Пустой bankItems во
  // время загрузки неотличим от честно пустого банка без bankLoading —
  // ровно то, что ExamPreview.tsx уже различает (LOADING_TEXT), а пикер
  // раньше не различал.
  it('банк ещё грузится — «Загружаем вопросы», не «Опубликованных вопросов пока нет»', async () => {
    const user = userEvent.setup();
    const blocks: ExamBlockDraft[] = [
      { title: '', itemIds: [], shuffle: false, required: false },
    ];
    renderField(blocks, { bankItems: [], bankLoading: true });

    await user.click(screen.getByRole('button', { name: 'Добавить вопрос' }));

    expect(screen.getByText('Загружаем вопросы…')).toBeInTheDocument();
    expect(
      screen.queryByText(/Опубликованных вопросов пока нет/),
    ).not.toBeInTheDocument();
  });
});

describe('ExamBlocksField — список вопросов блока', () => {
  const blocks: ExamBlockDraft[] = [
    { title: '', itemIds: ['i1', 'i2'], shuffle: false, required: false },
  ];
  const bankItems = [
    makeItem({ id: 'i1', prompt: 'Первый вопрос' }),
    makeItem({ id: 'i2', prompt: 'Второй вопрос' }),
  ];

  it('вопросы показаны в порядке itemIds', () => {
    renderField(blocks, { bankItems });
    const texts = screen
      .getAllByText(/^(Первый|Второй) вопрос$/)
      .map((el) => el.textContent);
    expect(texts).toEqual(['Первый вопрос', 'Второй вопрос']);
  });

  it('«Выше» у первого вопроса недоступна, у второго — переставляет порядок', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(blocks, { bankItems });

    const upButtons = screen.getAllByRole('button', { name: 'Выше' });
    expect(upButtons[0]).toBeDisabled();

    await user.click(upButtons[1] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([
      { title: '', itemIds: ['i2', 'i1'], shuffle: false, required: false },
    ]);
  });

  it('«Ниже» у последнего вопроса недоступна, у первого — переставляет порядок', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(blocks, { bankItems });

    const downButtons = screen.getAllByRole('button', { name: 'Ниже' });
    expect(downButtons[1]).toBeDisabled();

    await user.click(downButtons[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([
      { title: '', itemIds: ['i2', 'i1'], shuffle: false, required: false },
    ]);
  });

  it('«Убрать» у вопроса убирает его из блока', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(blocks, { bankItems });

    const removeButtons = screen.getAllByRole('button', { name: 'Убрать' });
    await user.click(removeButtons[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([
      { title: '', itemIds: ['i2'], shuffle: false, required: false },
    ]);
  });

  it('вопрос не найден в банке — честный текст, не пустота', () => {
    renderField([{ title: '', itemIds: ['missing'], shuffle: false, required: false }], {
      bankItems: [],
    });

    expect(screen.getByText(/Вопрос недоступен/)).toBeInTheDocument();
  });

  it('банк ещё грузится — текст загрузки вместо «недоступен»', () => {
    renderField([{ title: '', itemIds: ['i1'], shuffle: false, required: false }], {
      bankItems: [],
      bankLoading: true,
    });

    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
    expect(screen.queryByText(/недоступен/)).not.toBeInTheDocument();
  });
});

describe('ExamBlocksField — сбой загрузки банка', () => {
  it('показывает баннер ошибки с кнопкой повтора', async () => {
    const user = userEvent.setup();
    const onRetryBank = vi.fn();
    render(
      <ExamBlocksField
        blocks={[]}
        onChange={vi.fn()}
        bankItems={null}
        bankLoading={false}
        bankError="Не удалось загрузить вопросы."
        onRetryBank={onRetryBank}
        onPublishItem={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить вопросы.');
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));
    expect(onRetryBank).toHaveBeenCalledTimes(1);
  });
});
