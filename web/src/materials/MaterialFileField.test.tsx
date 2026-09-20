// Мокаем сам хук (не сеть) — по образцу exam-items/ExamItemOptionImage.test.tsx:
// компонент не знает, как устроена загрузка, только зовёт upload()/remove() и
// отражает pending/error (useMaterialFileUpload.test.ts проверяет сеть отдельно).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialDto, MaterialFileDto } from '@xuanxue/shared';
import { MaterialFileField } from './MaterialFileField';
import { useMaterialFileUpload } from './useMaterialFileUpload';

vi.mock('./useMaterialFileUpload');

const mockedUseUpload = vi.mocked(useMaterialFileUpload);
const MATERIAL_ID = 'm1';

function makeMaterial(): MaterialDto {
  return {
    id: MATERIAL_ID,
    title: 'Ван Пэйшэн — форма 24',
    url: '',
    kind: 'book',
    classIds: [],
    lessonIds: [],
    access: 'all',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function stubUpload(overrides: Partial<ReturnType<typeof useMaterialFileUpload>> = {}) {
  const upload = vi.fn().mockResolvedValue(makeMaterial());
  const remove = vi.fn().mockResolvedValue(makeMaterial());
  mockedUseUpload.mockReturnValue({
    upload,
    remove,
    pending: false,
    error: null,
    ...overrides,
  });
  return { upload, remove };
}

function makeFile(): MaterialFileDto {
  return {
    name: 'Ван Пэйшэн — форма 24.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2.5 * 1024 * 1024,
    uploadedAt: '2026-01-01T00:00:00Z',
  };
}

describe('MaterialFileField — файла нет', () => {
  it('кнопка «Добавить файл» и подсказка про форматы и потолок', () => {
    stubUpload();
    render(<MaterialFileField materialId={MATERIAL_ID} onChanged={vi.fn()} />);

    expect(screen.getByText('Добавить файл')).toBeInTheDocument();
    expect(screen.getByText(/PDF/)).toHaveTextContent('30 МБ');
    expect(screen.queryByRole('link', { name: 'Скачать' })).not.toBeInTheDocument();
  });

  it('выбор файла зовёт upload(); успех — onChanged()', async () => {
    const { upload } = stubUpload();
    const onChanged = vi.fn();
    render(<MaterialFileField materialId={MATERIAL_ID} onChanged={onChanged} />);
    const file = new File(['данные'], 'book.pdf', { type: 'application/pdf' });

    const input = screen.getByLabelText('Добавить файл');
    await userEvent.upload(input, file);

    expect(upload).toHaveBeenCalledWith(file);
    expect(onChanged).toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('upload() вернул null (ошибка) — onChanged не зовётся', async () => {
    stubUpload({ upload: vi.fn().mockResolvedValue(null) });
    const onChanged = vi.fn();
    render(<MaterialFileField materialId={MATERIAL_ID} onChanged={onChanged} />);
    const file = new File(['данные'], 'book.pdf', { type: 'application/pdf' });

    await userEvent.upload(screen.getByLabelText('Добавить файл'), file);

    expect(onChanged).not.toHaveBeenCalled();
  });

  it('pending — «Загружаем…» вместо кнопки', () => {
    stubUpload({ pending: true });
    render(<MaterialFileField materialId={MATERIAL_ID} onChanged={vi.fn()} />);

    expect(screen.getByText('Загружаем…')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Добавить файл')).not.toBeInTheDocument();
  });

  it('error — текст сбоя виден под полем', () => {
    stubUpload({
      error: 'Такой формат не подходит. Загрузите PDF или картинку — JPG, PNG, WebP.',
    });
    render(<MaterialFileField materialId={MATERIAL_ID} onChanged={vi.fn()} />);

    expect(
      screen.getByText(
        'Такой формат не подходит. Загрузите PDF или картинку — JPG, PNG, WebP.',
      ),
    ).toBeInTheDocument();
  });
});

describe('MaterialFileField — файл есть', () => {
  it('имя, размер, ссылка «Скачать» с адресом через /api, «Заменить файл», «Убрать файл»', () => {
    stubUpload();
    render(
      <MaterialFileField
        materialId={MATERIAL_ID}
        file={makeFile()}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByText('Ван Пэйшэн — форма 24.pdf')).toBeInTheDocument();
    expect(screen.getByText('2,5 МБ')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Скачать' });
    expect(link).toHaveAttribute('href', `/api/materials/${MATERIAL_ID}/file`);
    expect(screen.getByText('Заменить файл')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Убрать файл' })).toBeInTheDocument();
  });

  it('«Заменить файл» — тот же upload(), успех зовёт onChanged()', async () => {
    const { upload } = stubUpload();
    const onChanged = vi.fn();
    render(
      <MaterialFileField
        materialId={MATERIAL_ID}
        file={makeFile()}
        onChanged={onChanged}
      />,
    );
    const file = new File(['данные'], 'new.pdf', { type: 'application/pdf' });

    await userEvent.upload(screen.getByLabelText('Заменить файл'), file);

    expect(upload).toHaveBeenCalledWith(file);
    expect(onChanged).toHaveBeenCalled();
  });

  it('«Убрать файл» — зовёт remove(), успех зовёт onChanged()', async () => {
    const user = userEvent.setup();
    const { remove } = stubUpload();
    const onChanged = vi.fn();
    render(
      <MaterialFileField
        materialId={MATERIAL_ID}
        file={makeFile()}
        onChanged={onChanged}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Убрать файл' }));

    expect(remove).toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalled();
  });

  it('remove() вернул null (ошибка) — onChanged не зовётся', async () => {
    const user = userEvent.setup();
    stubUpload({ remove: vi.fn().mockResolvedValue(null) });
    const onChanged = vi.fn();
    render(
      <MaterialFileField
        materialId={MATERIAL_ID}
        file={makeFile()}
        onChanged={onChanged}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Убрать файл' }));

    expect(onChanged).not.toHaveBeenCalled();
  });
});
