import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import { ExamPreview } from './ExamPreview';

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

interface PreviewOverrides {
  title: string;
  description: string;
  bankLoading: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

function renderPreview(
  itemIds: string[],
  bankItems: ExamItemDto[],
  overrides: Partial<PreviewOverrides> = {},
) {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/exams']}>
      <ExamPreview
        title={overrides.title ?? 'Итоговый экзамен'}
        description={overrides.description ?? ''}
        itemIds={itemIds}
        shuffleQuestions={overrides.shuffleQuestions ?? false}
        shuffleOptions={overrides.shuffleOptions ?? false}
        bankItems={bankItems}
        bankLoading={overrides.bankLoading ?? false}
        onClose={onClose}
      />
    </MemoryRouter>,
  );
  return { onClose };
}

describe('ExamPreview — базовое', () => {
  it('role=dialog, заголовок — название экзамена, в фокусе', () => {
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

  it('без вопросов — честный текст, а не пустота', () => {
    renderPreview([], []);
    expect(screen.getByText(/пока нет вопросов/)).toBeInTheDocument();
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
    renderPreview(['i1'], [], { bankLoading: true });
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

describe('ExamPreview — вопросы по порядку', () => {
  it('вопросы рендерятся в порядке списка, а не банка', () => {
    const bankItems = [
      makeItem({ id: 'i1', prompt: 'Первый по id' }),
      makeItem({ id: 'i2', prompt: 'Второй по id, первый в списке' }),
    ];
    renderPreview(['i2', 'i1'], bankItems);

    const prompts = screen.getAllByText(/^\d\. /).map((el) => el.textContent);
    expect(prompts).toEqual(['1. Второй по id, первый в списке', '2. Первый по id']);
  });

  it('перемешивание вопросов — сказано, что порядок будет другим', () => {
    renderPreview(['i1'], [makeItem()], { shuffleQuestions: true });

    expect(screen.getByText(/Порядок вопросов будет другим/)).toBeInTheDocument();
  });

  it('перемешивание вариантов — сказано и про варианты', () => {
    renderPreview(['i1'], [makeItem()], { shuffleOptions: true });

    expect(screen.getByText(/Варианты ответа тоже встанут/)).toBeInTheDocument();
  });

  it('без перемешивания — заметок про порядок нет', () => {
    renderPreview(['i1'], [makeItem()]);

    expect(screen.queryByText(/другом порядке|будет другим/)).not.toBeInTheDocument();
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
    renderPreview(['i1'], [item]);

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
    renderPreview(['i1'], [item]);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();
  });

  it('video — объяснение, что придёт видео', () => {
    const item = makeItem({ kind: 'video' });
    renderPreview(['i1'], [item]);

    expect(screen.getByText(/придёт видео/)).toBeInTheDocument();
  });

  it('text — неактивное поле ответа', () => {
    const item = makeItem({ kind: 'text' });
    renderPreview(['i1'], [item]);

    expect(screen.getByLabelText('Ответ ученика')).toBeDisabled();
  });

  it('вопрос с подсказкой — подсказка видна ученику', () => {
    const item = makeItem({ hint: 'Смотрите в стойку' });
    renderPreview(['i1'], [item]);

    expect(screen.getByText('Смотрите в стойку')).toBeInTheDocument();
  });

  it('вопрос не найден в банке — честный текст', () => {
    renderPreview(['missing'], []);

    expect(screen.getByText(/Вопрос недоступен/)).toBeInTheDocument();
  });
});
