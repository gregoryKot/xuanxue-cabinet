// Общий контрол выбора файла (CLAUDE.md «Одна механика — один компонент»):
// его поведение проверяется здесь один раз, а не по разу у каждого
// потребителя (ExamItemOptionImage.tsx, MaterialFileField.tsx).
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilePickerButton } from './FilePickerButton';

function pdf(name = 'Методичка.pdf'): File {
  return new File(['%PDF-1.7'], name, { type: 'application/pdf' });
}

function input(): HTMLInputElement {
  // Скрытый input — не `display: none`: он обязан остаться в таб-порядке и
  // быть доступен скринридеру, поэтому его видно по роли/имени.
  return screen.getByLabelText('Добавить файл');
}

describe('FilePickerButton', () => {
  it('подпись кнопки — и текст label, и имя поля для скринридера', () => {
    render(
      <FilePickerButton
        label="Добавить файл"
        accept="application/pdf"
        pending={false}
        onFile={vi.fn()}
      />,
    );

    expect(screen.getByText('Добавить файл')).toBeInTheDocument();
    expect(input()).toHaveAttribute('type', 'file');
    expect(input()).toHaveAttribute('accept', 'application/pdf');
  });

  it('inputLabel называет поле отдельно от подписи — на экране таких полей несколько', () => {
    render(
      <FilePickerButton
        label="Добавить картинку"
        inputLabel="Картинка варианта 2"
        accept="image/png"
        pending={false}
        onFile={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Картинка варианта 2')).toBeInTheDocument();
    expect(screen.getByText('Добавить картинку')).toBeInTheDocument();
  });

  it('выбранный файл уходит в onFile', () => {
    const onFile = vi.fn();
    render(
      <FilePickerButton
        label="Добавить файл"
        accept="application/pdf"
        pending={false}
        onFile={onFile}
      />,
    );

    fireEvent.change(input(), { target: { files: [pdf()] } });

    expect(onFile).toHaveBeenCalledTimes(1);
    expect((onFile.mock.calls[0]?.[0] as File).name).toBe('Методичка.pdf');
  });

  // Тот же файл можно выбрать повторно после сбоя загрузки: браузер не шлёт
  // `change`, если input помнит прежнее значение.
  it('значение input сбрасывается — повторный выбор того же файла сработает', () => {
    const onFile = vi.fn();
    render(
      <FilePickerButton
        label="Добавить файл"
        accept="application/pdf"
        pending={false}
        onFile={onFile}
      />,
    );
    const field = input();

    fireEvent.change(field, { target: { files: [pdf()] } });

    expect(field.value).toBe('');
  });

  it('отмена выбора (files пуст) — onFile не зовём', () => {
    const onFile = vi.fn();
    render(
      <FilePickerButton
        label="Добавить файл"
        accept="application/pdf"
        pending={false}
        onFile={onFile}
      />,
    );

    fireEvent.change(input(), { target: { files: [] } });

    expect(onFile).not.toHaveBeenCalled();
  });

  it('идёт загрузка — вместо кнопки строка со статусом, выбрать файл нельзя', () => {
    render(
      <FilePickerButton
        label="Добавить файл"
        accept="application/pdf"
        pending
        onFile={vi.fn()}
      />,
    );

    expect(screen.getByText('Загружаем…')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByLabelText('Добавить файл')).not.toBeInTheDocument();
  });
});
