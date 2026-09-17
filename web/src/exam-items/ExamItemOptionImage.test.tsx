// Мокаем сам хук (не сеть) — ExamItemOptionImage не знает, как устроена
// загрузка, только вызывает upload() и отражает pending/error
// (useExamImageUpload.test.ts проверяет сеть отдельно).
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExamItemOptionImage } from './ExamItemOptionImage';
import { useExamImageUpload } from './useExamImageUpload';

vi.mock('./useExamImageUpload');

const mockedUseUpload = vi.mocked(useExamImageUpload);

function stubUpload(overrides: Partial<ReturnType<typeof useExamImageUpload>> = {}) {
  const upload = vi.fn().mockResolvedValue('img1');
  mockedUseUpload.mockReturnValue({ upload, pending: false, error: null, ...overrides });
  return upload;
}

describe('ExamItemOptionImage — без картинки', () => {
  it('кнопка «Добавить картинку» видна, поле файла доступно по подписи варианта', () => {
    stubUpload();
    render(<ExamItemOptionImage index={0} onChange={vi.fn()} />);

    expect(screen.getByText('Добавить картинку')).toBeInTheDocument();
    expect(screen.getByLabelText('Картинка варианта 1')).toHaveAttribute('type', 'file');
  });

  it('выбор файла зовёт upload() и записывает вернувшийся id через onChange', async () => {
    const upload = stubUpload();
    const onChange = vi.fn();
    render(<ExamItemOptionImage index={1} onChange={onChange} />);
    const file = new File(['фото'], 'photo.jpg', { type: 'image/jpeg' });

    const input = screen.getByLabelText('Картинка варианта 2');
    await userEvent.upload(input, file);

    expect(upload).toHaveBeenCalledWith(file);
    expect(onChange).toHaveBeenCalledWith('img1');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('диалог выбора файла закрыли без выбора — upload не зовётся', () => {
    const upload = stubUpload();
    render(<ExamItemOptionImage index={0} onChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Картинка варианта 1'), {
      target: { files: [] },
    });

    expect(upload).not.toHaveBeenCalled();
  });

  it('upload() вернул null (ошибка) — onChange не зовётся', async () => {
    const upload = vi.fn().mockResolvedValue(null);
    mockedUseUpload.mockReturnValue({ upload, pending: false, error: null });
    const onChange = vi.fn();
    render(<ExamItemOptionImage index={0} onChange={onChange} />);
    const file = new File(['фото'], 'photo.jpg', { type: 'image/jpeg' });

    await userEvent.upload(screen.getByLabelText('Картинка варианта 1'), file);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('pending — «Загружаем…» вместо кнопки, aria-busy', () => {
    stubUpload({ pending: true });
    render(<ExamItemOptionImage index={0} onChange={vi.fn()} />);

    expect(screen.getByText('Загружаем…')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Добавить картинку')).not.toBeInTheDocument();
  });

  it('error — текст сбоя виден под кнопкой', () => {
    stubUpload({ error: 'Такой формат не подходит.' });
    render(<ExamItemOptionImage index={0} onChange={vi.fn()} />);

    expect(screen.getByText('Такой формат не подходит.')).toBeInTheDocument();
  });
});

describe('ExamItemOptionImage — с картинкой', () => {
  it('показывает картинку и «Убрать картинку», без кнопки добавления', () => {
    stubUpload();
    render(<ExamItemOptionImage index={2} imageId="img9" onChange={vi.fn()} />);

    expect(screen.getByRole('img', { name: 'Картинка варианта 3' })).toHaveAttribute(
      'src',
      '/api/exam-images/img9',
    );
    expect(screen.getByRole('button', { name: 'Убрать картинку' })).toBeInTheDocument();
    expect(screen.queryByText('Добавить картинку')).not.toBeInTheDocument();
  });

  it('«Убрать картинку» снимает imageId через onChange(undefined)', async () => {
    stubUpload();
    const onChange = vi.fn();
    render(<ExamItemOptionImage index={0} imageId="img9" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать картинку' }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
