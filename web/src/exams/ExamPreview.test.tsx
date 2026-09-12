import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import { ExamPreview } from './ExamPreview';
import type { ExamBlockDraft } from './examBlocksInput';

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
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

function renderPreview(
  blocks: ExamBlockDraft[],
  bankItems: ExamItemDto[],
  overrides: Partial<{ title: string; description: string; bankLoading: boolean }> = {},
) {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/exams']}>
      <ExamPreview
        title={overrides.title ?? 'Итоговый экзамен'}
        description={overrides.description ?? ''}
        blocks={blocks}
        bankItems={bankItems}
        bankLoading={overrides.bankLoading ?? false}
        onClose={onClose}
      />
    </MemoryRouter>,
  );
  return { onClose };
}

describe('ExamPreview — базовое', () => {
  it('role=dialog, заголовок — название формы, в фокусе', () => {
    renderPreview([], []);

    const dialog = screen.getByRole('dialog');
    const heading = screen.getByRole('heading', { name: 'Итоговый экзамен' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(heading).toHaveFocus();
  });

  it('без названия — запасной заголовок', () => {
    renderPreview([], [], { title: '' });
    expect(
      screen.getByRole('heading', { name: 'Экзамен без названия' }),
    ).toBeInTheDocument();
  });

  it('без блоков — честный текст, а не пустота', () => {
    renderPreview([], []);
    expect(screen.getByText(/пока нет блоков/)).toBeInTheDocument();
  });

  it('с описанием — текст описания виден ученику', () => {
    renderPreview([], [], { description: 'Экзамен по базовым формам' });
    expect(screen.getByText('Экзамен по базовым формам')).toBeInTheDocument();
  });

  it('без описания — абзаца описания нет', () => {
    renderPreview([], [], { description: '' });
    expect(screen.queryByText('Экзамен по базовым формам')).not.toBeInTheDocument();
  });

  it('банк ещё грузится — текст загрузки, не «недоступен»', () => {
    renderPreview(
      [{ title: 'Теория', itemIds: ['i1'], shuffle: false, required: false }],
      [],
      { bankLoading: true },
    );
    expect(screen.getByText(/Загружаем вопросы/)).toBeInTheDocument();
    expect(screen.queryByText(/недоступен/)).not.toBeInTheDocument();
  });

  it('«Закрыть» вызывает onClose, ничего не отправляет', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPreview([], []);

    expect(
      screen.queryByRole('button', { name: /Сохранить|Отправить/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ExamPreview — блоки и вопросы по порядку', () => {
  it('блоки и вопросы рендерятся в порядке из state', () => {
    const blocks: ExamBlockDraft[] = [
      { title: 'Теория', itemIds: ['i2', 'i1'], shuffle: false, required: false },
    ];
    const bankItems = [
      makeItem({ id: 'i1', prompt: 'Первый по id' }),
      makeItem({ id: 'i2', prompt: 'Второй по id, первый в блоке' }),
    ];
    renderPreview(blocks, bankItems);

    const prompts = screen.getAllByText(/^\d\. /).map((el) => el.textContent);
    expect(prompts).toEqual(['1. Второй по id, первый в блоке', '2. Первый по id']);
  });

  it('перемешиваемый блок — сказано, что порядок будет другим', () => {
    const blocks: ExamBlockDraft[] = [
      { title: 'Форма', itemIds: ['i1'], shuffle: true, required: false },
    ];
    renderPreview(blocks, [makeItem()]);

    expect(screen.getByText(/будет другим у каждого сдающего/)).toBeInTheDocument();
  });

  it('без перемешивания — заметки про порядок нет', () => {
    const blocks: ExamBlockDraft[] = [
      { title: 'Форма', itemIds: ['i1'], shuffle: false, required: false },
    ];
    renderPreview(blocks, [makeItem()]);

    expect(screen.queryByText(/будет другим/)).not.toBeInTheDocument();
  });

  it('обязательный блок — помечен в заголовке', () => {
    const blocks: ExamBlockDraft[] = [
      { title: 'Форма', itemIds: [], shuffle: false, required: true },
    ];
    renderPreview(blocks, []);

    expect(screen.getByText(/Форма · обязателен/)).toBeInTheDocument();
  });
});

describe('ExamPreview — типы вопросов', () => {
  it('single — неактивные radio с текстом вариантов', () => {
    const item = makeItem({
      kind: 'single',
      options: [
        { id: 'o1', text: '24', correct: true },
        { id: 'o2', text: '108', correct: false },
      ],
    });
    renderPreview(
      [{ title: '', itemIds: ['i1'], shuffle: false, required: false }],
      [item],
    );

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    radios.forEach((radio) => expect(radio).toBeDisabled());
    expect(screen.getByText('24')).toBeInTheDocument();
  });

  it('multiple — неактивные checkbox', () => {
    const item = makeItem({
      kind: 'multiple',
      options: [{ id: 'o1', text: 'A', correct: true }],
    });
    renderPreview(
      [{ title: '', itemIds: ['i1'], shuffle: false, required: false }],
      [item],
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();
  });

  it('video — объяснение, что придёт видео', () => {
    const item = makeItem({ kind: 'video' });
    renderPreview(
      [{ title: '', itemIds: ['i1'], shuffle: false, required: false }],
      [item],
    );

    expect(screen.getByText(/придёт видео/)).toBeInTheDocument();
  });

  it('text — неактивное поле ответа', () => {
    const item = makeItem({ kind: 'text' });
    renderPreview(
      [{ title: '', itemIds: ['i1'], shuffle: false, required: false }],
      [item],
    );

    expect(screen.getByLabelText('Ответ ученика')).toBeDisabled();
  });

  it('вопрос с подсказкой — подсказка видна ученику', () => {
    const item = makeItem({ hint: 'Смотрите в стойку' });
    renderPreview(
      [{ title: '', itemIds: ['i1'], shuffle: false, required: false }],
      [item],
    );

    expect(screen.getByText('Смотрите в стойку')).toBeInTheDocument();
  });

  it('вопрос не найден в банке — честный текст', () => {
    renderPreview(
      [{ title: '', itemIds: ['missing'], shuffle: false, required: false }],
      [],
    );

    expect(screen.getByText(/Вопрос недоступен/)).toBeInTheDocument();
  });
});
