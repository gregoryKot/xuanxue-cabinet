// Общие хелперы e2e событий школы (ADR-0177): тело валидного события,
// замороженное «сейчас» и запросы штата. Вынесены, чтобы доступ и проверки
// ввода жили в разных файлах (файл-храповик, CLAUDE.md §5) без копипаста.
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { SchoolEventDto } from '@xuanxue/shared';
import { SchoolEventRecord } from '../../src/school-events/school-event.schema';
import type { TestApp } from './create-app';
import { withCsrf } from './http';

/** «Сейчас» сценария: Settings.now ставит сам спек. */
export const SCHOOL_EVENTS_NOW = DateTime.fromISO('2026-11-11T10:00:00Z', {
  zone: 'utc',
});

export const SCHOOL_EVENT_BODY = {
  title: 'Ретрит в Галилее',
  startsAt: '2026-11-20T07:00:00Z',
  endsAt: '2026-11-22T15:00:00Z',
  place: 'Кибуц Амиад',
  description: 'Что **взять**: тёплую одежду',
};

export function createSchoolEventHelpers(getApp: () => TestApp): {
  server: () => ReturnType<TestApp['app']['getHttpServer']>;
  eventModel: () => Model<SchoolEventRecord>;
  postEvent: (cookie: string, body: Record<string, unknown>) => request.Test;
  patchEvent: (cookie: string, id: string, body: Record<string, unknown>) => request.Test;
  deleteEvent: (cookie: string, id: string) => request.Test;
  createEvent: (
    cookie: string,
    body?: Record<string, unknown>,
  ) => Promise<SchoolEventDto>;
} {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();
  const postEvent = (cookie: string, body: Record<string, unknown>): request.Test =>
    withCsrf(request(server()).post('/api/events')).set('Cookie', cookie).send(body);
  return {
    server,
    eventModel: () =>
      getApp().app.get<Model<SchoolEventRecord>>(getModelToken(SchoolEventRecord.name), {
        strict: false,
      }),
    postEvent,
    patchEvent: (cookie, id, body) =>
      withCsrf(request(server()).patch(`/api/events/${id}`))
        .set('Cookie', cookie)
        .send(body),
    deleteEvent: (cookie, id) =>
      withCsrf(request(server()).delete(`/api/events/${id}`)).set('Cookie', cookie),
    createEvent: async (cookie, body = SCHOOL_EVENT_BODY) => {
      const res = await postEvent(cookie, body);
      if (res.status !== 201) throw new Error(`POST /events → ${res.status}`);
      return res.body as SchoolEventDto;
    },
  };
}
