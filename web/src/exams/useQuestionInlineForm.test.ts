// Оркестрация хука формы вопроса на месте (ADR-0040, дополнение 2026-09-27):
// валидация — та же чистая логика, что у страницы вопроса
// (exam-items/examItemFormInput.test.ts), здесь проверяется только submit —
// создание (POST) и правка (PATCH) по образцу exam-items/useExamItemForm.test.ts.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch, ApiError } from '../api/http';
import { useQuestionInlineForm } from './useQuestionInlineForm';

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
    status: 'published',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useQuestionInlineForm — создание (item: null)', () => {
  it('пустая формулировка — submit не уходит в сеть, есть validationError', async () => {
    const { result } = renderHook(() => useQuestionInlineForm(null));

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
    const { result } = renderHook(() => useQuestionInlineForm(null));

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
        options: undefined,
      },
    });
  });

  it('ApiError от сервера — serverError с деталями, submit возвращает null', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Конфликт', 409, 'conflict', ['подробность']),
    );
    const { result } = renderHook(() => useQuestionInlineForm(null));

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

describe('useQuestionInlineForm — правка (item задан)', () => {
  it('состояние заполнено из вопроса, submit — PATCH /exam-items/:id', async () => {
    const item = makeItem({ id: 'i7', prompt: 'Старая формулировка' });
    const updated = { ...item, prompt: 'Новая формулировка' };
    mockedApiFetch.mockResolvedValue(updated);
    const { result } = renderHook(() => useQuestionInlineForm(item));

    expect(result.current.state.prompt).toBe('Старая формулировка');

    act(() => {
      result.current.setField('prompt', 'Новая формулировка');
    });

    let saved: ExamItemDto | null = null;
    await act(async () => {
      saved = await result.current.submit();
    });

    expect(saved).toEqual(updated);
    expect(mockedApiFetch).toHaveBeenCalledWith('/exam-items/i7', {
      method: 'PATCH',
      body: {
        prompt: 'Новая формулировка',
        videoId: null,
        videoUrl: null,
        options: undefined,
      },
    });
  });

  it('ApiError от сервера при правке — serverError, submit возвращает null', async () => {
    const item = makeItem({ id: 'i7' });
    mockedApiFetch.mockRejectedValue(new ApiError('Отказ', 400, 'invalid_input'));
    const { result } = renderHook(() => useQuestionInlineForm(item));

    let saved: ExamItemDto | null = makeItem();
    await act(async () => {
      saved = await result.current.submit();
    });

    expect(saved).toBeNull();
    expect(result.current.serverError?.message).toBe('Отказ');
  });
});
