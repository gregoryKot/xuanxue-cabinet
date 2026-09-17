// Предпросмотр «глазами ученика» показывает сохранённый экзамен, отвечать в
// нём нельзя (ТЗ 4.3): поля ответа выключены, а событие ввода, если оно всё
// же долетело (клавиатура на уже сфокусированном поле, программный dispatch),
// ничего не меняет — значение остаётся пустым. ExamPreviewScreen.test.tsx
// проверяет только `disabled`; здесь — что и сам ввод глотается.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import { ExamPreviewQuestion } from './ExamPreviewQuestion';

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
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('ExamPreviewQuestion — поля не принимают ввод', () => {
  it('text — ввод и уход с поля не меняют значение, поле остаётся пустым и выключенным', () => {
    render(<ExamPreviewQuestion index={0} item={makeItem()} />);

    const textarea = screen.getByRole('textbox', { name: 'Опишите принцип песчинки' });
    fireEvent.change(textarea, { target: { value: 'мой ответ' } });
    fireEvent.blur(textarea);

    expect(textarea).toBeDisabled();
    expect(textarea).toHaveValue('');
  });

  it('single — переключатели выключены, клик не отмечает вариант', () => {
    render(
      <ExamPreviewQuestion
        index={1}
        item={makeItem({
          id: 'i2',
          kind: 'single',
          options: [
            { id: 'o1', text: '24', correct: true },
            { id: 'o2', text: '108', correct: false },
          ],
        })}
      />,
    );

    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0] as HTMLElement);

    radios.forEach((radio) => {
      expect(radio).toBeDisabled();
      expect(radio).not.toBeChecked();
    });
  });

  it('вопрос удалён из банка (item нет) — подпись «недоступен» вместо поля ответа', () => {
    render(<ExamPreviewQuestion index={2} />);

    expect(screen.getByText(/Вопрос недоступен/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
