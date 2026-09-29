// Записи карты маршрутов (api-routes.ts, ADR-0148) — материалы (ADR-0033,
// ADR-0134). Записи редактора — общий useEntityEditor; POST отдаёт созданный
// материал: по его id страница шлёт следом файл. Файл (ADR-0057) уходит
// сырым телом, а ответ загрузки и отвязки — материал целиком: кабинет кладёт
// его на экран без второго GET (ADR-0087). `GET /materials/:id/file` — 302 на
// подписанный адрес, его открывает браузер по ссылке, в карту он не входит.
import type {
  CreateMaterialInput,
  ListMaterialsQuery,
  ListMyMaterialsQuery,
  MaterialDto,
  MyMaterialDto,
  UpdateMaterialInput,
} from './materials';
import type { UploadMaterialFileQuery } from './material-files';
import type { RawBody } from './raw-body';

export interface MaterialsRoutes {
  'GET /materials': {
    query: ListMaterialsQuery;
    body: undefined;
    response: MaterialDto[];
  };
  'GET /materials/:id': { query: undefined; body: undefined; response: MaterialDto };
  'POST /materials': {
    query: undefined;
    body: CreateMaterialInput;
    response: MaterialDto;
  };
  'PATCH /materials/:id': {
    query: undefined;
    body: UpdateMaterialInput;
    response: MaterialDto;
  };
  'DELETE /materials/:id': { query: undefined; body: undefined; response: void };
  'POST /materials/:id/file': {
    query: UploadMaterialFileQuery;
    body: RawBody;
    response: MaterialDto;
  };
  'DELETE /materials/:id/file': {
    query: undefined;
    body: undefined;
    response: MaterialDto;
  };
  'GET /me/materials': {
    query: ListMyMaterialsQuery;
    body: undefined;
    response: MyMaterialDto[];
  };
}

export const MATERIALS_ROUTE_KEYS: Record<keyof MaterialsRoutes, true> = {
  'GET /materials': true,
  'GET /materials/:id': true,
  'POST /materials': true,
  'PATCH /materials/:id': true,
  'DELETE /materials/:id': true,
  'POST /materials/:id/file': true,
  'DELETE /materials/:id/file': true,
  'GET /me/materials': true,
};
