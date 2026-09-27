// Мокаем сам хук загрузки (не сеть) — useImageAttach не знает, как устроена
// загрузка, только вызывает upload() и отражает pending/error
// (useExamImageUpload.test.ts проверяет сеть отдельно). Хук возвращает JSX
// (menuItem.onSelect, hiddenInput, preview) — обёртка-компонент рендерит их,
// как это делает вызывающая сторона (ExamItemOptionMedia.tsx).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useImageAttach } from './useImageAttach';
import { useExamImageUpload } from './useExamImageUpload';

vi.mock('./useExamImageUpload');

const mockedUseUpload = vi.mocked(useExamImageUpload);

function stubUpload(overrides: Partial<ReturnType<typeof useExamImageUpload>> = {}) {
  const upload = vi.fn().mockResolvedValue('img1');
  mockedUseUpload.mockReturnValue({ upload, pending: false, error: null, ...overrides });
  return upload;
}

function Harness({
  imageId,
  onChange,
}: {
  imageId?: string;
  onChange: (imageId: string | undefined) => void;
}) {
  const attach = useImageAttach(0, imageId, onChange);
  return (
    <>
      <button type="button" onClick={attach.menuItem.onSelect}>
        {attach.menuItem.label}
      </button>
      {attach.hiddenInput}
      {attach.preview}
    </>
  );
}

describe('useImageAttach — без картинки', () => {
  it('пункт меню «Картинка» открывает выбор файла — клик по скрытому input', async () => {
    stubUpload();
    render(<Harness onChange={vi.fn()} />);
    const input = screen.getByLabelText('Картинка варианта 1');
    const clickSpy = vi.spyOn(input, 'click');

    await userEvent.click(screen.getByRole('button', { name: 'Картинка' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('выбор файла зовёт upload() и записывает вернувшийся id через onChange', async () => {
    const upload = stubUpload();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const file = new File(['фото'], 'photo.jpg', { type: 'image/jpeg' });

    await userEvent.upload(screen.getByLabelText('Картинка варианта 1'), file);

    expect(upload).toHaveBeenCalledWith(file);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('img1'));
  });

  it('выбор отменён (файла нет) — upload() не зовётся', () => {
    const upload = stubUpload();
    render(<Harness onChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Картинка варианта 1'), {
      target: { files: [] },
    });

    expect(upload).not.toHaveBeenCalled();
  });

  it('upload() вернул null (ошибка) — onChange не зовётся', async () => {
    mockedUseUpload.mockReturnValue({
      upload: vi.fn().mockResolvedValue(null),
      pending: false,
      error: null,
    });
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const file = new File(['фото'], 'photo.jpg', { type: 'image/jpeg' });

    await userEvent.upload(screen.getByLabelText('Картинка варианта 1'), file);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('pending — «Загружаем…» видно', () => {
    stubUpload({ pending: true });
    render(<Harness onChange={vi.fn()} />);

    expect(screen.getByText('Загружаем…')).toHaveAttribute('aria-busy', 'true');
  });

  it('error — текст сбоя виден', () => {
    stubUpload({ error: 'Такой формат не подходит.' });
    render(<Harness onChange={vi.fn()} />);

    expect(screen.getByText('Такой формат не подходит.')).toBeInTheDocument();
  });

  it('ни картинки, ни pending, ни ошибки — превью нет', () => {
    stubUpload();
    const { container } = render(<Harness onChange={vi.fn()} />);

    // Только скрытый input и кнопка меню — превью пусто.
    expect(container.querySelectorAll('div')).toHaveLength(0);
  });
});

describe('useImageAttach — с картинкой', () => {
  it('показывает картинку и «Убрать картинку»', () => {
    stubUpload();
    render(<Harness imageId="img9" onChange={vi.fn()} />);

    expect(screen.getByRole('img', { name: 'Картинка варианта 1' })).toHaveAttribute(
      'src',
      '/api/exam-images/img9',
    );
    expect(screen.getByRole('button', { name: 'Убрать картинку' })).toBeInTheDocument();
  });

  it('«Убрать картинку» снимает imageId через onChange(undefined)', async () => {
    stubUpload();
    const onChange = vi.fn();
    render(<Harness imageId="img9" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Убрать картинку' }));

    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
