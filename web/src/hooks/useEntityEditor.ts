// Данные страницы-редактора одной записи: прочитать её по адресу, создать,
// сохранить, удалить (ADR-0033 — редактор стал обычной страницей с адресом,
// а не листом поверх списка). Запись читается своим `GET /коллекция/:id`, а
// не выбирается из загруженного списка: страницу открывают по ссылке, списка
// рядом может не быть вовсе. У новой записи читать нечего — запрос не уходит.
//
// Общий хук на все коллекции редактора: два одинаковых набора create/update/
// remove в соседних файлах jscpd ловит как дубль (CLAUDE.md «Одна механика —
// один компонент»). Домен приносит только коллекцию и текст ошибки.
//
// Типы — по коллекции, а не по строке пути (PLAN §17.1, ADR-0148):
// `EditorCollection` — те, у кого в карте маршрутов есть все четыре записи
// редактора. Коллекция без `GET /коллекция/:id` не пройдёт `tsc`, а e2e-сверка
// карты с Nest потребует под этот ключ обработчик — так «Cannot GET
// /api/materials/:id» (2026-09-27) больше не доезжает до прода.
import { useCallback } from 'react';
import type { ApiRouteBody, ApiRouteKey, ApiRouteResponse } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { useAbortableFetch } from './useAbortableFetch';

type CandidateCollection = ApiRouteKey extends infer K
  ? K extends `GET ${infer C}/:id`
    ? C
    : never
  : never;

/** Коллекция, у которой в карте есть все четыре записи редактора. */
export type EditorCollection = {
  [C in CandidateCollection]: [
    `POST ${C}` | `PATCH ${C}/:id` | `DELETE ${C}/:id`,
  ] extends [ApiRouteKey]
    ? C
    : never;
}[CandidateCollection];

type EditorKey<
  C extends EditorCollection,
  M extends 'GET' | 'PATCH' | 'DELETE',
> = Extract<`${M} ${C}/:id`, ApiRouteKey>;
type CreateKey<C extends EditorCollection> = Extract<`POST ${C}`, ApiRouteKey>;

interface UseEntityEditorResult<TDto, TCreateInput, TUpdateInput, TCreateResult> {
  /** `null` — новая запись, её ещё нет на сервере. */
  entity: TDto | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Ответ POST — созданная запись: материалу (ADR-0134) её id нужен сразу,
   * по нему страница шлёт следом файл. */
  create: (input: TCreateInput) => Promise<TCreateResult>;
  update: (id: string, input: TUpdateInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export type EntityEditorOf<C extends EditorCollection> = UseEntityEditorResult<
  ApiRouteResponse<EditorKey<C, 'GET'>>,
  ApiRouteBody<CreateKey<C>>,
  ApiRouteBody<EditorKey<C, 'PATCH'>>,
  ApiRouteResponse<CreateKey<C>>
>;

// TS не сужает ключ-шаблон от дженерика `C`, и `apiRoute<K>` с условными
// типами параметров на неразрешённом `K` не вызвать. Внутри хука зовём его
// как нетипизированный, а снаружи типы дают `EntityEditorOf<C>` и
// `EditorCollection`: ключ, чьей записи в карте нет, сюда просто не дойдёт.
type UntypedApiRoute = (
  key: ApiRouteKey,
  init?: { params?: { id: string }; body?: unknown; signal?: AbortSignal },
) => Promise<unknown>;
const untypedApiRoute = apiRoute as unknown as UntypedApiRoute;

export function useEntityEditor<C extends EditorCollection>(
  collection: C,
  id: string | undefined,
  loadErrorMessage: string,
): EntityEditorOf<C> {
  type Editor = EntityEditorOf<C>;
  const { data, loading, error, reload } = useAbortableFetch(
    (signal) =>
      untypedApiRoute(`GET ${collection}/:id` as EditorKey<C, 'GET'>, {
        params: { id: id ?? '' },
        signal,
      }) as Promise<ApiRouteResponse<EditorKey<C, 'GET'>>>,
    loadErrorMessage,
    { enabled: id !== undefined },
  );

  // Перечитывать запись после сохранения отдельным GET незачем: страница
  // уходит на список, а домену, которому свежая запись нужна тут же
  // (материал, ADR-0134), её приносит сам ответ POST (ADR-0087).
  const create = useCallback(
    (input: Parameters<Editor['create']>[0]) =>
      untypedApiRoute(`POST ${collection}` as CreateKey<C>, {
        body: input,
      }) as ReturnType<Editor['create']>,
    [collection],
  );

  const update = useCallback(
    async (entityId: string, input: Parameters<Editor['update']>[1]) => {
      await untypedApiRoute(`PATCH ${collection}/:id` as EditorKey<C, 'PATCH'>, {
        params: { id: entityId },
        body: input,
      });
    },
    [collection],
  );

  const remove = useCallback(
    async (entityId: string) => {
      await untypedApiRoute(`DELETE ${collection}/:id` as EditorKey<C, 'DELETE'>, {
        params: { id: entityId },
      });
    },
    [collection],
  );

  return { entity: data, loading, error, reload, create, update, remove };
}
