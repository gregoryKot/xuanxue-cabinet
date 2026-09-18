// useExamItemForm.test.ts и exams/useExamForm.test.ts проверяют конкретные
// домены (и не дублируют этот файл — jscpd не смотрит на *.test.ts); здесь —
// сама оркестрация на фейковой сущности, без домена. Черновик (ADR-0052)
// пишется в реальный localStorage под фиксированным ключом — очищаем между
// тестами, иначе черновик одного теста восстановился бы в соседнем.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { readDraft } from '../lib/formDraft';
import { useEntityForm } from './useEntityForm';

interface FakeEntity {
  id: string;
  name: string;
  status: 'draft' | 'published';
}

interface FakeFormState {
  name: string;
}

afterEach(() => {
  localStorage.clear();
});

function baseConfig(
  entity: FakeEntity | null,
  overrides: Partial<
    Parameters<
      typeof useEntityForm<
        FakeEntity,
        FakeFormState,
        { name: string },
        { name?: string; status?: 'draft' | 'published' },
        'draft' | 'published'
      >
    >[0]
  > = {},
) {
  return {
    entity,
    getId: (e: FakeEntity) => e.id,
    initialState: (e: FakeEntity | null) => ({ name: e?.name ?? '' }),
    validate: (state: FakeFormState) => (state.name.trim() ? null : 'Название пустое.'),
    toCreateInput: (state: FakeFormState) => ({ name: state.name }),
    toUpdateInput: (state: FakeFormState) => ({ name: state.name }),
    toStatusInput: (state: FakeFormState, status: 'draft' | 'published') => ({
      name: state.name,
      status,
    }),
    onCreate: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    saveErrorMessage: 'Не удалось сохранить.',
    removeErrorMessage: 'Не удалось удалить.',
    statusErrorMessage: 'Не удалось изменить статус.',
    draftKey: `fake:${entity?.id ?? 'new'}`,
    ...overrides,
  };
}

describe('useEntityForm — создание', () => {
  it('невалидное состояние — onCreate не зовётся, validationError выставлен', async () => {
    const config = baseConfig(null);
    const { result } = renderHook(() => useEntityForm(config));

    await act(async () => {
      await result.current.submit();
    });

    expect(config.onCreate).not.toHaveBeenCalled();
    expect(result.current.validationError).toBe('Название пустое.');
  });

  it('валидное состояние — onCreate зовётся с телом из toCreateInput', async () => {
    const config = baseConfig(null);
    const { result } = renderHook(() => useEntityForm(config));

    act(() => result.current.setField('name', 'Тест'));
    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(config.onCreate).toHaveBeenCalledWith({ name: 'Тест' });
  });

  it('ApiError от onCreate — serverError с деталями', async () => {
    const config = baseConfig(null, {
      onCreate: vi
        .fn()
        .mockRejectedValue(new ApiError('Конфликт', 409, 'conflict', ['д'])),
    });
    const { result } = renderHook(() => useEntityForm(config));
    act(() => result.current.setField('name', 'Тест'));

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.serverError).toEqual({ message: 'Конфликт', details: ['д'] });
  });
});

describe('useEntityForm — правка/удаление/статус', () => {
  const entity: FakeEntity = { id: 'e1', name: 'Существующее', status: 'draft' };

  it('submit с сущностью — onUpdate зовётся по её id', async () => {
    const config = baseConfig(entity);
    const { result } = renderHook(() => useEntityForm(config));

    await act(async () => {
      await result.current.submit();
    });

    expect(config.onUpdate).toHaveBeenCalledWith('e1', { name: 'Существующее' });
  });

  it('remove() без сущности — false, onRemove не зовётся', async () => {
    const config = baseConfig(null);
    const { result } = renderHook(() => useEntityForm(config));

    let ok = true;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(false);
    expect(config.onRemove).not.toHaveBeenCalled();
  });

  it('remove() с сущностью — onRemove по её id', async () => {
    const config = baseConfig(entity);
    const { result } = renderHook(() => useEntityForm(config));

    let ok = false;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(true);
    expect(config.onRemove).toHaveBeenCalledWith('e1');
  });

  it('changeStatus() без правок — шлёт status вместе с текущими полями формы', async () => {
    const config = baseConfig(entity);
    const { result } = renderHook(() => useEntityForm(config));

    let ok = false;
    await act(async () => {
      ok = await result.current.changeStatus('published');
    });

    expect(ok).toBe(true);
    // toUpdateInput(state) здесь — { name: 'Существующее' } (поле не менялось),
    // status добавляется поверх: та же форма запроса, что у submit().
    expect(config.onUpdate).toHaveBeenCalledWith('e1', {
      name: 'Существующее',
      status: 'published',
    });
  });

  it('changeStatus() с несохранёнными правками — шлёт и правки, и статус одним запросом', async () => {
    // Блокер аудита 2026-09-15 №1: «Опубликовать» отправлял только смену
    // статуса и закрывал лист, молча теряя всё, что наменяли в форме.
    const config = baseConfig(entity);
    const { result } = renderHook(() => useEntityForm(config));

    act(() => result.current.setField('name', 'Правка перед публикацией'));

    let ok = false;
    await act(async () => {
      ok = await result.current.changeStatus('published');
    });

    expect(ok).toBe(true);
    expect(config.onUpdate).toHaveBeenCalledWith('e1', {
      name: 'Правка перед публикацией',
      status: 'published',
    });
  });

  it('changeStatus() с невалидной формой — onUpdate не зовётся, validationError выставлен', async () => {
    const config = baseConfig(entity);
    const { result } = renderHook(() => useEntityForm(config));

    act(() => result.current.setField('name', '   '));

    let ok = true;
    await act(async () => {
      ok = await result.current.changeStatus('published');
    });

    expect(ok).toBe(false);
    expect(config.onUpdate).not.toHaveBeenCalled();
    expect(result.current.validationError).toBe('Название пустое.');
  });

  it('ошибка changeStatus() — статус не меняется (false), общий текст в serverError', async () => {
    const config = baseConfig(entity, {
      onUpdate: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const { result } = renderHook(() => useEntityForm(config));

    let ok = true;
    await act(async () => {
      ok = await result.current.changeStatus('published');
    });

    expect(ok).toBe(false);
    expect(result.current.serverError?.message).toBe('Не удалось изменить статус.');
  });
});

describe('useEntityForm — черновик (ADR-0052)', () => {
  // Совпадает с draftKey из baseConfig() — тесты берут ключ явной строкой,
  // не через config.draftKey (string | null): readDraft() ждёт string.
  const NEW_DRAFT_KEY = 'fake:new';
  const EXISTING_DRAFT_KEY = 'fake:e1';

  it('правка пишет черновик, восстанавливается при повторном монтаже', () => {
    const config = baseConfig(null);
    const first = renderHook(() => useEntityForm(config));
    act(() => first.result.current.setField('name', 'Черновик'));
    first.unmount();

    const second = renderHook(() => useEntityForm(config));

    expect(second.result.current.state).toEqual({ name: 'Черновик' });
    expect(second.result.current.draftRestored).toBe(true);
  });

  it('discardDraft возвращает форму к исходному и стирает запись', () => {
    const config = baseConfig(null);
    const { result } = renderHook(() => useEntityForm(config));
    act(() => result.current.setField('name', 'Черновик'));

    act(() => result.current.discardDraft());

    expect(result.current.state).toEqual({ name: '' });
    expect(readDraft(NEW_DRAFT_KEY, Date.now())).toBeNull();
  });

  it('успешный submit() чистит черновик', async () => {
    const config = baseConfig(null);
    const { result } = renderHook(() => useEntityForm(config));
    act(() => result.current.setField('name', 'Тест'));

    await act(async () => {
      await result.current.submit();
    });

    expect(readDraft(NEW_DRAFT_KEY, Date.now())).toBeNull();
  });

  it('упавший submit() оставляет черновик — человек не теряет набранное', async () => {
    const config = baseConfig(null, {
      onCreate: vi.fn().mockRejectedValue(new Error('boom')),
    });
    const { result } = renderHook(() => useEntityForm(config));
    act(() => result.current.setField('name', 'Тест'));

    await act(async () => {
      await result.current.submit();
    });

    expect(readDraft(NEW_DRAFT_KEY, Date.now())).toEqual({ name: 'Тест' });
  });

  it('успешные remove() и changeStatus() тоже чистят черновик', async () => {
    const entity: FakeEntity = { id: 'e1', name: 'Существующее', status: 'draft' };
    const config = baseConfig(entity);
    const { result } = renderHook(() => useEntityForm(config));
    act(() => result.current.setField('name', 'Правка'));

    await act(async () => {
      await result.current.changeStatus('published');
    });
    expect(readDraft(EXISTING_DRAFT_KEY, Date.now())).toBeNull();

    act(() => result.current.setField('name', 'Ещё правка'));
    await act(async () => {
      await result.current.remove();
    });
    expect(readDraft(EXISTING_DRAFT_KEY, Date.now())).toBeNull();
  });

  it('draftKey === null — форма работает без черновика', () => {
    const config = baseConfig(null, { draftKey: null });
    const { result } = renderHook(() => useEntityForm(config));

    act(() => result.current.setField('name', 'Без черновика'));

    expect(result.current.draftRestored).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});
