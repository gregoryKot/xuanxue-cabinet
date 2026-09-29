// Записи карты маршрутов (api-routes.ts, ADR-0148) — материалы (ADR-0033,
// ADR-0134). Записи редактора — общий useEntityEditor; POST отдаёт созданный
// материал: по его id страница шлёт следом файл.
import type { CreateMaterialInput, MaterialDto, UpdateMaterialInput } from './materials';

export interface MaterialsRoutes {
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
}

export const MATERIALS_ROUTE_KEYS: Record<keyof MaterialsRoutes, true> = {
  'GET /materials/:id': true,
  'POST /materials': true,
  'PATCH /materials/:id': true,
  'DELETE /materials/:id': true,
};
