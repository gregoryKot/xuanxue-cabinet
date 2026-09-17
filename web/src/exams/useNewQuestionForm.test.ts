// Оркестрация хука быстрого создания вопроса (ADR-0040): валидация — та же
// чистая логика, что у страницы вопроса (exam-items/examItemFormInput.test.ts),
// здесь проверяется только submit — шлёт POST /exam-items и возвращает
// созданный вопрос или `null` при отказе, по образцу
// exam-items/useExamItemForm.test.ts.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch, ApiError } from '../api/http';
import { useNewQuestionForm } from './useNewQuestionForm';

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
    prompt: 'Как дышать в стойке?',
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

describe('useNewQuestionForm — создание', () => {
  it('пустая формулировка — submit не уходит в сеть, есть validationError', async () => {
    const { result } = renderHook(() => useNewQuestionForm());

    let created: ExamItemDto | null = makeItem();
    await act(async () => {
      created = await result.current.submit();
    });

    expect(created).toBeNull();
    expect(result.current.validationError).toMatch(/формулировку/);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('успешный submit — POST /exam-items с телом из состояния, возвращает созданный вопрос', async () => {
    const item = makeItem();
    mockedApiFetch.mockResolvedValue(item);
    const { result } = renderHook(() => useNewQuestionForm());

    act(() => {
      result.current.setField('prompt', '  Как дышать в стойке?  ');
    });

    let created: ExamItemDto | null = null;
    await act(async () => {
      created = await result.current.submit();
    });

    expect(created).toEqual(item);
    expect(mockedApiFetch).toHaveBeenCalledWith('/exam-items', {
      method: 'POST',
      body: {
        kind: 'text',
        prompt: 'Как дышать в стойке?',
        hint: undefined,
        criteria: undefined,
        options: undefined,
        tags: [],
      },
    });
  });

  it('ApiError от сервера — serverError с деталями, submit возвращает null', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Конфликт', 409, 'conflict', ['подробность']),
    );
    const { result } = renderHook(() => useNewQuestionForm());

    act(() => {
      result.current.setField('prompt', 'Вопрос');
    });

    let created: ExamItemDto | null = makeItem();
    await act(async () => {
      created = await result.current.submit();
    });

    expect(created).toBeNull();
    expect(result.current.serverError).toEqual({
      message: 'Конфликт',
      details: ['подробность'],
    });
  });
});
