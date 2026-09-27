// Форма вопроса на месте — режим создания и правки (ADR-0040, дополнение
// 2026-09-27): подписи кнопки сохранения, строка про общий вопрос только при
// правке, и фокус сразу в формулировку при открытии (отзыв владельца:
// «фокус сразу в поле, без лишнего клика»).
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { QuestionInlineForm } from './QuestionInlineForm';

// useFileStorageEnabled сам ходит в /auth/config при монтировании — здесь
// содержимое ответа не важно (поля видео/картинки не проверяются), отказ
// хук молча превращает в fileStorageEnabled: false.
vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'i1',
    kind: 'text',
    prompt: 'Старая формулировка',
    options: [],
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('QuestionInlineForm', () => {
  it('создание — фокус сразу в формулировке, подпись кнопки «Добавить в экзамен»', () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сети'));

    render(<QuestionInlineForm item={null} onSaved={() => {}} onCancel={() => {}} />);

    expect(screen.getByLabelText('Формулировка')).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Добавить в экзамен' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Изменения попадут/)).not.toBeInTheDocument();
  });

  it('правка — поле заполнено вопросом, строка про общий вопрос, подпись «Сохранить вопрос»', () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сети'));
    const item = makeItem();

    render(<QuestionInlineForm item={item} onSaved={() => {}} onCancel={() => {}} />);

    expect(screen.getByLabelText('Формулировка')).toHaveValue('Старая формулировка');
    expect(
      screen.getByText('Изменения попадут во все экзамены с этим вопросом.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить вопрос' })).toBeInTheDocument();
  });
});
