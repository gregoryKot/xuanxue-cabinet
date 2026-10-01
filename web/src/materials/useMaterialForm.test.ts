// Оркестрация страницы материала — по образцу channels/useChannelForm.test.ts.
// Механика submit/remove/ошибки — общий hooks/useValidatedEntityForm.ts,
// здесь проверяется только конфигурация под домен материала. Контекст файла
// (ADR-0134) в этих тестах — «файла нет», подробности про необязательную
// ссылку и созданный при сбое материал — в useNewMaterialFile.test.ts и
// materialFormInput.file.test.ts.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialDto } from '@xuanxue/shared';
import { ApiError } from '../api/http';
import { useMaterialForm, type UseMaterialFormArgs } from './useMaterialForm';

const NO_FILE = { hasFile: false, fileSupported: false };

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Ван Пэйшэн — форма 24',
    url: 'https://example.com/book',
    kind: 'book',
    classIds: [],
    lessonIds: [],
    access: 'all',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeArgs(overrides: Partial<UseMaterialFormArgs> = {}): UseMaterialFormArgs {
  return {
    material: null,
    file: NO_FILE,
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}

describe('useMaterialForm — submit()', () => {
  it('невалидная форма — validationError, onCreate не зовётся', async () => {
    const onCreate = vi.fn();
    const { result } = renderHook(() => useMaterialForm(makeArgs({ onCreate })));

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(result.current.validationError?.field).toBe('title');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('новый материал — галочка «Сообщить ученикам» стоит сразу, у существующего — нет (ADR-0162)', () => {
    const created = renderHook(() => useMaterialForm(makeArgs()));
    const edited = renderHook(() =>
      useMaterialForm(makeArgs({ material: makeMaterial() })),
    );

    expect(created.result.current.state.notifyStudents).toBe(true);
    expect(edited.result.current.state.notifyStudents).toBe(false);
  });

  it('создание — валидная форма зовёт onCreate с собранным телом', async () => {
    const onCreate = vi.fn().mockResolvedValue(makeMaterial());
    const { result } = renderHook(() => useMaterialForm(makeArgs({ onCreate })));

    act(() => {
      result.current.setField('title', 'Ван Пэйшэн — форма 24');
      result.current.setField('url', 'https://example.com/book');
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    // ADR-0162: у нового материала галочка «Сообщить ученикам» стоит сразу.
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Ван Пэйшэн — форма 24',
      url: 'https://example.com/book',
      kind: 'book',
      classIds: [],
      access: 'all',
      tags: [],
      notifyStudents: true,
    });
  });

  it('правка — onUpdate по id материала', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useMaterialForm(makeArgs({ material: makeMaterial(), onUpdate })),
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(onUpdate).toHaveBeenCalledWith('m1', {
      title: 'Ван Пэйшэн — форма 24',
      url: 'https://example.com/book',
      kind: 'book',
      classIds: [],
      access: 'all',
      tags: [],
    });
  });

  it('ApiError при сохранении — serverError с текстом сервера', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(new ApiError('Проверьте поля.', 400, 'invalid_input'));
    const { result } = renderHook(() => useMaterialForm(makeArgs({ onCreate })));

    act(() => {
      result.current.setField('title', 'Название');
      result.current.setField('url', 'https://example.com');
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.serverError?.message).toBe('Проверьте поля.');
  });
});

describe('useMaterialForm — remove()', () => {
  it('без выбранного материала — false, onRemove не вызывается', async () => {
    const onRemove = vi.fn();
    const { result } = renderHook(() => useMaterialForm(makeArgs({ onRemove })));

    let ok = true;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(false);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('успешно удаляет материал по id', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useMaterialForm(makeArgs({ material: makeMaterial(), onRemove })),
    );

    let ok = false;
    await act(async () => {
      ok = await result.current.remove();
    });

    expect(ok).toBe(true);
    expect(onRemove).toHaveBeenCalledWith('m1');
  });

  it('сбой удаления — общий текст ошибки', async () => {
    const onRemove = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useMaterialForm(makeArgs({ material: makeMaterial(), onRemove })),
    );

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.serverError?.message).toBe(
      'Не удалось удалить. Попробуйте ещё раз.',
    );
  });
});

describe('useMaterialForm — контекст файла (ADR-0134)', () => {
  it('hasFile: true — пустая ссылка не мешает создать материал', async () => {
    const onCreate = vi.fn().mockResolvedValue(makeMaterial());
    const { result } = renderHook(() =>
      useMaterialForm(
        makeArgs({ file: { hasFile: true, fileSupported: true }, onCreate }),
      ),
    );

    act(() => {
      result.current.setField('title', 'Методичка');
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    const body = onCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('url' in body).toBe(false);
  });
});
