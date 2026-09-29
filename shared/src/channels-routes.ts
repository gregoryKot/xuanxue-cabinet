// Записи карты маршрутов (api-routes.ts, ADR-0148) — каналы рассылки
// (ADR-0033). Записи редактора — общий useEntityEditor.
import type { ChannelDto, CreateChannelInput, UpdateChannelInput } from './channels';

export interface ChannelsRoutes {
  'GET /channels/:id': { query: undefined; body: undefined; response: ChannelDto };
  'POST /channels': { query: undefined; body: CreateChannelInput; response: ChannelDto };
  'PATCH /channels/:id': {
    query: undefined;
    body: UpdateChannelInput;
    response: ChannelDto;
  };
  'DELETE /channels/:id': { query: undefined; body: undefined; response: void };
}

export const CHANNELS_ROUTE_KEYS: Record<keyof ChannelsRoutes, true> = {
  'GET /channels/:id': true,
  'POST /channels': true,
  'PATCH /channels/:id': true,
  'DELETE /channels/:id': true,
};
