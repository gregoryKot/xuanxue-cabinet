// Пути «Проверки работ» и экрана сдачи — только то, что делит таблица
// предзагрузки (routeModules.ts) с хуками: ключ кэша prefetchCache.ts —
// строка пути, и собирается она тем же `apiRoutePath`, что и запрос
// (PLAN §17.1). Своим файлом, а не в apiPaths.ts — тот упёрся в файловый
// храповик (CLAUDE.md «Храповики»).
import { LIST_LIMIT_MAX, type ListAttemptsQuery } from '@xuanxue/shared';
import { apiRoutePath } from './apiRoute';

/** Query очередей «Проверки работ» (docs/PLAN.md §4.6): хук зовёт `apiRoute`
 * с ним, строка пути ниже — для таблицы предзагрузки, ключ кэша
 * prefetchCache.ts у них общий (PLAN §17.1). Порядок полей — часть строки. */
export const GRADING_QUEUE_QUERY: ListAttemptsQuery = {
  status: 'submitted',
  limit: LIST_LIMIT_MAX,
};
/** Второй список — уже проверенные, рядом с очередью ждущих. */
export const GRADED_ATTEMPTS_QUERY: ListAttemptsQuery = {
  status: 'graded',
  limit: LIST_LIMIT_MAX,
};
export const GRADING_QUEUE_PATH = apiRoutePath('GET /attempts', {
  query: GRADING_QUEUE_QUERY,
});
export const GRADED_ATTEMPTS_PATH = apiRoutePath('GET /attempts', {
  query: GRADED_ATTEMPTS_QUERY,
});

/** Своя попытка экрана сдачи (ADR-0126) — не весь список `?limit=200`. */
export function attemptPath(attemptId: string): string {
  return apiRoutePath('GET /attempts/:id', { params: { id: attemptId } });
}

export function attemptReviewPath(attemptId: string): string {
  return apiRoutePath('GET /attempts/:id/review', { params: { id: attemptId } });
}
