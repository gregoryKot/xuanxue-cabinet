// Сырое тело запроса — байты файла без обёртки JSON (картинка варианта
// ADR-0035, снимок оплаты ADR-0050, файл материала ADR-0057). В карте
// маршрутов (api-routes.ts) это `body` таких записей.

/** Своим описанием, а не `Blob`: `shared` собирается без DOM-типов, а
 * структурно `Blob` браузера сюда подходит. */
export interface RawBody {
  readonly size: number;
  readonly type: string;
}
