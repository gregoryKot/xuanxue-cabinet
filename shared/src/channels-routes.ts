// Записи карты маршрутов (api-routes.ts, ADR-0148) — каналы рассылки
// (ADR-0033). Записи редактора — общий useEntityEditor; список и «Проверить»
// на карточке канала — свои хуки (useChannels, useChannelTest).
import type {
  ChannelDto,
  ChannelTestResult,
  CreateChannelInput,
  ListChannelsQuery,
  UpdateChannelInput,
} from './channels';

export interface ChannelsRoutes {
  'GET /channels': { query: ListChannelsQuery; body: undefined; response: ChannelDto[] };
  'GET /channels/:id': { query: undefined; body: undefined; response: ChannelDto };
  'POST /channels': { query: undefined; body: CreateChannelInput; response: ChannelDto };
  'PATCH /channels/:id': {
    query: undefined;
    body: UpdateChannelInput;
    response: ChannelDto;
  };
  'DELETE /channels/:id': { query: undefined; body: undefined; response: void };
  'POST /channels/:id/test': {
    query: undefined;
    body: undefined;
    response: ChannelTestResult;
  };
}

export const CHANNELS_ROUTE_KEYS: Record<keyof ChannelsRoutes, true> = {
  'GET /channels': true,
  'GET /channels/:id': true,
  'POST /channels': true,
  'PATCH /channels/:id': true,
  'DELETE /channels/:id': true,
  'POST /channels/:id/test': true,
};
