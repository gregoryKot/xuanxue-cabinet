// Чистая функция без Nest и без Mongo (CLAUDE.md «Любой код с логикой
// приезжает с тестом» — уровень «чистая логика»): решает, что ответить,
// зная только readyState соединения. Единственное место, где статус текста
// и HTTP-код связаны с готовностью Mongo — контроллер сам не решает.
import { HttpStatus } from '@nestjs/common';
import { ConnectionStates } from 'mongoose';
import type { HealthStatus } from './health.controller';

export interface HealthOutcome {
  httpStatus: number;
  status: HealthStatus['status'];
  mongo: HealthStatus['mongo'];
}

// Railway переключает трафик только после успешного GET /api/health
// (RUNBOOK §2) — пока Mongo не готова, инстанс не должен выглядеть здоровым,
// иначе трафик уедет на инстанс без базы.
export function healthOutcome(readyState: ConnectionStates): HealthOutcome {
  const isMongoUp = readyState === ConnectionStates.connected;
  return isMongoUp
    ? { httpStatus: HttpStatus.OK, status: 'ok', mongo: 'up' }
    : { httpStatus: HttpStatus.SERVICE_UNAVAILABLE, status: 'degraded', mongo: 'down' };
}
