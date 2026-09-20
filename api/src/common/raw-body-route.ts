// Разбор запроса для предикатов сырого парсера тела (app.setup.ts). Двое
// потребителей: картинки вариантов (exam-image-body.ts, ADR-0035) и файлы
// материалов (material-file-body.ts, ADR-0057) — один разбор пути и типа на
// обоих, не по копии в каждом (CLAUDE.md «Дубли и мёртвый код»).

/** Минимальный интерфейс вместо `IncomingMessage` из `'http'` напрямую — тот
 * же приём, что `RequestLike` в common/http-headers.ts. `IncomingMessage`
 * структурно совместим с ним (url?/method?/headers['content-type'] — те же
 * типы), поэтому предикаты подходят под `type?: (req: IncomingMessage) => any`
 * из NestExpressBodyParserOptions без приведения. */
export interface IncomingRequestLike {
  url?: string;
  method?: string;
  headers: { 'content-type'?: string | string[] | undefined };
}

/** Путь без query и без завершающего слэша. */
export function routePath(url: string | undefined): string {
  const path = (url ?? '').split('?')[0] ?? '';
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** `Content-Type` без параметров (`; charset=…`), в нижнем регистре. */
export function mediaType(header: string | string[] | undefined): string {
  if (typeof header !== 'string') return '';
  return (header.split(';')[0] ?? '').trim().toLowerCase();
}
