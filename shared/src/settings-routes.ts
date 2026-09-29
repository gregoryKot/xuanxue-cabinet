// Записи карты маршрутов (api-routes.ts, ADR-0148) — настройки школы и
// предпросмотр шаблона (docs/PLAN.md §6 «Шаблоны»). PATCH отдаёт целый
// `SettingsDto`, а не 204: кабинет кладёт его на экран без второго GET
// (ADR-0087, useSettings.ts), и карта держит это обещание — включая поля,
// которые приезжают позже (`paymentReminder`, ADR-0051).
import type {
  PreviewTemplateInput,
  PreviewTemplateResult,
  SettingsDto,
  UpdateSettingsInput,
} from './settings';

export interface SettingsRoutes {
  'GET /settings': { query: undefined; body: undefined; response: SettingsDto };
  'PATCH /settings': {
    query: undefined;
    body: UpdateSettingsInput;
    response: SettingsDto;
  };
  'POST /settings/preview': {
    query: undefined;
    body: PreviewTemplateInput;
    response: PreviewTemplateResult;
  };
}

export const SETTINGS_ROUTE_KEYS: Record<keyof SettingsRoutes, true> = {
  'GET /settings': true,
  'PATCH /settings': true,
  'POST /settings/preview': true,
};
