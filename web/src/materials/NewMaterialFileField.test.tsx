// Файл ещё не созданного материала (ADR-0133) — сети здесь нет вовсе, все
// обработчики стоят снаружи (useNewMaterialFile.ts), проверяем только вид.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewMaterialFileField } from './NewMaterialFileField';

function makeFile(name = 'book.pdf', type = 'application/pdf', bytes = 10): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('NewMaterialFileField — файл не выбран', () => {
  it('кнопка «Добавить файл» и подсказка про форматы и потолок', () => {
    render(
      <NewMaterialFileField
        file={null}
        error={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('Файл материала')).toBeInTheDocument();
    expect(screen.getByText('Добавить файл')).toBeInTheDocument();
    expect(screen.getByText(/PDF/)).toHaveTextContent('30 МБ');
  });

  it('выбор файла зовёт onSelect с самим File', async () => {
    const onSelect = vi.fn();
    render(
      <NewMaterialFileField
        file={null}
        error={null}
        onSelect={onSelect}
        onRemove={vi.fn()}
      />,
    );
    const file = makeFile();

    await userEvent.upload(screen.getByLabelText('Добавить файл'), file);

    expect(onSelect).toHaveBeenCalledWith(file);
  });

  it('error — текст сбоя виден под полем', () => {
    render(
      <NewMaterialFileField
        file={null}
        error="Такой формат файла не поддерживается."
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('Такой формат файла не поддерживается.')).toBeInTheDocument();
  });
});

describe('NewMaterialFileField — файл выбран', () => {
  it('имя, размер, честная строка про отправку при сохранении, «Заменить файл», «Убрать файл»', () => {
    render(
      <NewMaterialFileField
        file={makeFile('Методичка.pdf', 'application/pdf', 2.5 * 1024 * 1024)}
        error={null}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('Методичка.pdf')).toBeInTheDocument();
    expect(screen.getByText('2,5 МБ')).toBeInTheDocument();
    expect(screen.getByText(/Сохранить/)).toBeInTheDocument();
    expect(screen.getByText('Заменить файл')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Убрать файл' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Скачать' })).not.toBeInTheDocument();
  });

  it('«Убрать файл» зовёт onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <NewMaterialFileField
        file={makeFile()}
        error={null}
        onSelect={vi.fn()}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Убрать файл' }));

    expect(onRemove).toHaveBeenCalled();
  });

  it('«Заменить файл» зовёт onSelect с новым файлом', async () => {
    const onSelect = vi.fn();
    render(
      <NewMaterialFileField
        file={makeFile()}
        error={null}
        onSelect={onSelect}
        onRemove={vi.fn()}
      />,
    );
    const next = makeFile('new.pdf');

    await userEvent.upload(screen.getByLabelText('Заменить файл'), next);

    expect(onSelect).toHaveBeenCalledWith(next);
  });
});
