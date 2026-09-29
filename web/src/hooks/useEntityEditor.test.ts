// Общий хук редактора: рантайм (какие запросы уходят по коллекции) и типы.
// Типы держит `tsc` web — он проверяет и тесты, а директива
// `@ts-expect-error` без ошибки под ней сама роняет typecheck (PLAN §17.1,
// образец — api/apiRoute.test.ts): коллекция без записей редактора в карте
// маршрутов не должна проходить.
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { CreateMaterialInput, MaterialDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import {
  useEntityEditor,
  type EditorCollection,
  type EntityEditorOf,
} from './useEntityEditor';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const LOAD_ERROR = 'Не удалось открыть запись.';
const MATERIAL_ID = 'm1';

describe('useEntityEditor — запросы по коллекции', () => {
  it('читает запись по GET /коллекция/:id', async () => {
    mockedApiFetch.mockResolvedValue({ id: MATERIAL_ID });

    const { result } = renderHook(() =>
      useEntityEditor('/materials', MATERIAL_ID, LOAD_ERROR),
    );

    await waitFor(() => expect(result.current.entity).toEqual({ id: MATERIAL_ID }));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/materials/m1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('у новой записи читать нечего — запрос не уходит', () => {
    const { result } = renderHook(() =>
      useEntityEditor('/materials', undefined, LOAD_ERROR),
    );

    expect(result.current.entity).toBeNull();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('create отдаёт ответ POST, update и remove — PATCH и DELETE по id', async () => {
    mockedApiFetch.mockResolvedValue({ id: MATERIAL_ID });
    const { result } = renderHook(() =>
      useEntityEditor('/materials', undefined, LOAD_ERROR),
    );

    const created = await result.current.create({ title: 'Форма' } as never);
    await result.current.update(MATERIAL_ID, { title: 'Новая' });
    await result.current.remove(MATERIAL_ID);

    expect(created).toEqual({ id: MATERIAL_ID });
    expect(mockedApiFetch).toHaveBeenCalledWith('/materials', {
      method: 'POST',
      body: { title: 'Форма' },
    });
    expect(mockedApiFetch).toHaveBeenCalledWith('/materials/m1', {
      method: 'PATCH',
      body: { title: 'Новая' },
    });
    expect(mockedApiFetch).toHaveBeenCalledWith('/materials/m1', {
      method: 'DELETE',
      body: undefined,
    });
  });
});

describe('useEntityEditor — контракт держит tsc', () => {
  it('коллекция без записей редактора в карте — ошибка компиляции', () => {
    // Сами вызовы не исполняются — проверка только для компилятора.
    const useTypeOnlyChecks = (): void => {
      // @ts-expect-error — `/me/inbox`: `GET /:id` и `POST` в карте нет
      void useEntityEditor('/me/inbox', undefined, LOAD_ERROR);
      // @ts-expect-error — такой коллекции в карте нет вовсе
      void useEntityEditor('/unknown', undefined, LOAD_ERROR);
      // @ts-expect-error — `/me/payments` — не коллекция редактора
      const notEditable: EditorCollection = '/me/payments';
      void notEditable;
      const editable: EditorCollection = '/materials';
      void editable;
    };
    expect(useTypeOnlyChecks).toBeTypeOf('function');
  });

  it('типы записи, тела и ответа create берутся из карты', () => {
    expectTypeOf<
      EntityEditorOf<'/materials'>['entity']
    >().toEqualTypeOf<MaterialDto | null>();
    expectTypeOf<
      Parameters<EntityEditorOf<'/materials'>['create']>[0]
    >().toEqualTypeOf<CreateMaterialInput>();
    expectTypeOf<ReturnType<EntityEditorOf<'/materials'>['create']>>().toEqualTypeOf<
      Promise<MaterialDto>
    >();
    expect(true).toBe(true);
  });
});
