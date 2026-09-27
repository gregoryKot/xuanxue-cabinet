import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExamItemOptionsField } from './ExamItemOptionsField';
import type { ExamItemOptionDraft } from './examItemFormInput';
import type { ExamVideoValue } from './examVideoFormInput';
import { useExamImageUpload } from './useExamImageUpload';
import { useExamVideoField } from './useExamVideoField';

// Само поле видео — своя логика и свои тесты в ExamVideoField.test.tsx;
// здесь заглушка вместо него, чтобы проверить только то, что updateVideo
// пишет видео нужному варианту по индексу и снимает картинку — то, что не
// тестируется на уровне самого поля.
vi.mock('./ExamVideoField', () => ({
  ExamVideoField: ({
    inputLabel,
    onChange,
  }: {
    inputLabel: string;
    onChange: (video: ExamVideoValue) => void;
  }) => (
    <button type="button" onClick={() => onChange({ videoUrl: 'https://youtu.be/x' })}>
      {inputLabel}
    </button>
  ),
}));

// Загрузка картинки — своя логика с полным покрытием в
// ExamItemOptionImage.test.tsx; здесь мокаем хук и проверяем только, что
// результат доходит до onChange поля по правильному индексу варианта
// (updateImage) — то, что не тестируется на уровне самой картинки.
vi.mock('./useExamImageUpload');
const mockedUseUpload = vi.mocked(useExamImageUpload);
// Дефолт для тестов, которым загрузка картинки не важна — без него
// деструктуризация в ExamItemOptionImage упала бы на auto-mock (undefined).
mockedUseUpload.mockReturnValue({ upload: vi.fn(), pending: false, error: null });

// Видео варианта — та же логика, своё покрытие в ExamVideoField.test.tsx.
vi.mock('./useExamVideoField');
const mockedUseVideoField = vi.mocked(useExamVideoField);
mockedUseVideoField.mockReturnValue({
  uploadPending: false,
  uploadProgress: null,
  error: null,
  urlDraft: '',
  setUrlDraft: vi.fn(),
  uploadFile: vi.fn(),
  commitUrl: vi.fn(),
  clear: vi.fn(),
});

describe('ExamItemOptionsField — single (радио)', () => {
  it('отметка одного варианта снимает отметку другого', async () => {
    const user = userEvent.setup();
    const options: ExamItemOptionDraft[] = [
      { text: 'A', correct: true },
      { text: 'B', correct: false },
    ];
    const onChange = vi.fn();
    render(
      <ExamItemOptionsField
        kind="single"
        options={options}
        fileStorageEnabled={false}
        onChange={onChange}
      />,
    );

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
        fileStorageEnabled={false}
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
      <ExamItemOptionsField
        kind="multiple"
        options={options}
        fileStorageEnabled={false}
        onChange={onChange}
      />,
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
        fileStorageEnabled={false}
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
    render(
      <ExamItemOptionsField
        kind="single"
        options={[]}
        fileStorageEnabled={false}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Добавить вариант' }));

    expect(onChange).toHaveBeenCalledWith([{ text: '', correct: false }]);
  });

  it('меньше минимума — подсказка про минимум видна', () => {
    render(
      <ExamItemOptionsField
        kind="single"
        options={[]}
        fileStorageEnabled={false}
        onChange={vi.fn()}
      />,
    );

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
        fileStorageEnabled={false}
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
        fileStorageEnabled={false}
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
    render(
      <ExamItemOptionsField
        kind="single"
        options={options}
        fileStorageEnabled={false}
        onChange={vi.fn()}
      />,
    );

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
    render(
      <ExamItemOptionsField
        kind="single"
        options={options}
        fileStorageEnabled={false}
        onChange={onChange}
      />,
    );
    const file = new File(['фото'], 'photo.jpg', { type: 'image/jpeg' });

    await userEvent.upload(screen.getByLabelText('Картинка варианта 2'), file);

    expect(upload).toHaveBeenCalledWith(file);
    expect(onChange).toHaveBeenCalledWith([
      { text: 'A', correct: true },
      { text: 'B', correct: false, imageId: 'img9' },
    ]);
  });
});

describe('ExamItemOptionsField — видео варианта (ADR-0133)', () => {
  it('видео у одного варианта пишет его только по своему индексу, соседний не трогает', async () => {
    const onChange = vi.fn();
    const options: ExamItemOptionDraft[] = [
      { text: 'A', correct: true },
      { text: 'B', correct: false },
    ];
    render(
      <ExamItemOptionsField
        kind="single"
        options={options}
        fileStorageEnabled={false}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByText('Видео варианта 2'));

    expect(onChange).toHaveBeenCalledWith([
      { text: 'A', correct: true },
      { text: 'B', correct: false, videoUrl: 'https://youtu.be/x' },
    ]);
  });

  it('вариант без медиа — видео уходит без картинки рядом', async () => {
    const onChange = vi.fn();
    const options: ExamItemOptionDraft[] = [{ text: 'A', correct: true }];
    render(
      <ExamItemOptionsField
        kind="single"
        options={options}
        fileStorageEnabled={false}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByText('Видео варианта 1'));

    expect(onChange).toHaveBeenCalledWith([
      { text: 'A', correct: true, imageId: undefined, videoUrl: 'https://youtu.be/x' },
    ]);
  });
});

// Отметка «верный вариант» рисуется системным чекбоксом 18×18 — крупнее он не
// бывает, — а цель нажатия обязана быть 44×44 (CLAUDE.md «Доступность»).
// Цель несёт <label> вокруг отметки, а первая колонка строки расширена под
// неё модификатором .xuanxue-option-row (index.css): у строки вопроса в той
// же колонке номер, ей 28px достаточно.
describe('ExamItemOptionsField — цель нажатия отметки «верный вариант»', () => {
  it('отметка обёрнута в цель 44×44, нажатие по полю вокруг переключает её', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ExamItemOptionsField
        kind="single"
        options={[{ text: 'Вправо', correct: false }]}
        fileStorageEnabled={false}
        onChange={onChange}
      />,
    );

    const mark = screen.getByRole('radio', { name: 'Верный вариант 1' });
    const target = mark.closest('label') as HTMLElement;
    expect(target).not.toBeNull();
    expect(target.style.width).toBe('44px');
    expect(target.style.height).toBe('44px');

    await user.click(target);
    expect(onChange).toHaveBeenCalledWith([{ text: 'Вправо', correct: true }]);
  });

  it('строка варианта несёт модификатор широкой первой колонки', () => {
    render(
      <ExamItemOptionsField
        kind="single"
        options={[{ text: 'Вправо', correct: false }]}
        fileStorageEnabled={false}
        onChange={vi.fn()}
      />,
    );

    const row = screen
      .getByRole('radio', { name: 'Верный вариант 1' })
      .closest('.xuanxue-question-row');
    expect(row).toHaveClass('xuanxue-option-row');
  });
});
