import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExamItemOptionsField } from './ExamItemOptionsField';
import type { ExamItemOptionDraft } from './examItemFormInput';
import { useExamImageUpload } from './useExamImageUpload';

// Загрузка картинки — своя логика с полным покрытием в
// ExamItemOptionImage.test.tsx; здесь мокаем хук и проверяем только, что
// результат доходит до onChange поля по правильному индексу варианта
// (updateImage) — то, что не тестируется на уровне самой картинки.
vi.mock('./useExamImageUpload');
const mockedUseUpload = vi.mocked(useExamImageUpload);
// Дефолт для тестов, которым загрузка картинки не важна — без него
// деструктуризация в ExamItemOptionImage упала бы на auto-mock (undefined).
mockedUseUpload.mockReturnValue({ upload: vi.fn(), pending: false, error: null });

describe('ExamItemOptionsField — single (радио)', () => {
  it('отметка одного варианта снимает отметку другого', async () => {
    const user = userEvent.setup();
    const options: ExamItemOptionDraft[] = [
      { text: 'A', correct: true },
      { text: 'B', correct: false },
    ];
    const onChange = vi.fn();
    render(<ExamItemOptionsField kind="single" options={options} onChange={onChange} />);

    await user.click(screen.getByLabelText('Верный вариант 2'));

    expect(onChange).toHaveBeenCalledWith([
      { text: 'A', correct: false },
      { text: 'B', correct: true },
    ]);
  });

  it('оба варианта отрисованы радио-кнопками одной группы', () => {
    render(
      <ExamItemOptionsField
        kind="single"
        options={[
          { text: 'A', correct: true },
          { text: 'B', correct: false },
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Верный вариант 1')).toHaveAttribute('type', 'radio');
  });
});

describe('ExamItemOptionsField — multiple (чекбоксы)', () => {
  it('отметка одного варианта не снимает отметку другого', async () => {
    const user = userEvent.setup();
    const options: ExamItemOptionDraft[] = [
      { text: 'A', correct: true },
      { text: 'B', correct: false },
    ];
    const onChange = vi.fn();
    render(
      <ExamItemOptionsField kind="multiple" options={options} onChange={onChange} />,
    );

    await user.click(screen.getByLabelText('Верный вариант 2'));

    expect(onChange).toHaveBeenCalledWith([
      { text: 'A', correct: true },
      { text: 'B', correct: true },
    ]);
  });

  it('отрисованы чекбоксами', () => {
    render(
      <ExamItemOptionsField
        kind="multiple"
        options={[{ text: 'A', correct: false }]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Верный вариант 1')).toHaveAttribute('type', 'checkbox');
  });
});

describe('ExamItemOptionsField — добавление и удаление', () => {
  it('«Добавить вариант» добавляет пустую строку', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ExamItemOptionsField kind="single" options={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Добавить вариант' }));

    expect(onChange).toHaveBeenCalledWith([{ text: '', correct: false }]);
  });

  it('меньше минимума — подсказка про минимум видна', () => {
    render(<ExamItemOptionsField kind="single" options={[]} onChange={vi.fn()} />);

    expect(screen.getByText(/Добавьте минимум/)).toBeInTheDocument();
  });

  it('«Убрать вариант» убирает вариант по индексу', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ExamItemOptionsField
        kind="single"
        options={[
          { text: 'A', correct: true },
          { text: 'B', correct: false },
        ]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Убрать вариант 1' }));

    expect(onChange).toHaveBeenCalledWith([{ text: 'B', correct: false }]);
  });

  it('изменение текста варианта', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ExamItemOptionsField
        kind="single"
        options={[{ text: '', correct: false }]}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText('Текст варианта 1'), 'X');

    expect(onChange).toHaveBeenCalledWith([{ text: 'X', correct: false }]);
  });

  it('достигнут optionsMax — кнопка «Добавить вариант» скрыта', () => {
    const options = Array.from({ length: 10 }, (_, i) => ({
      text: `Вариант ${i}`,
      correct: i === 0,
    }));
    render(<ExamItemOptionsField kind="single" options={options} onChange={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Добавить вариант' }),
    ).not.toBeInTheDocument();
  });
});

describe('ExamItemOptionsField — картинка варианта (ADR-0035)', () => {
  it('выбор файла у одного варианта пишет imageId только ему, соседний не трогает', async () => {
    const upload = vi.fn().mockResolvedValue('img9');
    mockedUseUpload.mockReturnValue({ upload, pending: false, error: null });
    const onChange = vi.fn();
    const options: ExamItemOptionDraft[] = [
      { text: 'A', correct: true },
      { text: 'B', correct: false },
    ];
    render(<ExamItemOptionsField kind="single" options={options} onChange={onChange} />);
    const file = new File(['фото'], 'photo.jpg', { type: 'image/jpeg' });

    await userEvent.upload(screen.getByLabelText('Картинка варианта 2'), file);

    expect(upload).toHaveBeenCalledWith(file);
    expect(onChange).toHaveBeenCalledWith([
      { text: 'A', correct: true },
      { text: 'B', correct: false, imageId: 'img9' },
    ]);
  });
});
