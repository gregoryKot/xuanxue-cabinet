// Аудит 2026-09-21 (HIGH, устойчивость процесса): без явных retryAttempts/
// retryDelay Nest ждёт Mongo по дефолту библиотеки 9×3с=27с и бросает —
// дальше не поднимаются IndexSyncService/MigrationRunner, процесс не
// стартует. При деплое это не страшно (Railway держит старый инстанс, см.
// RUNBOOK §2, §8.3), но при НЕ-деплойном рестарте единственного инстанса
// (OOM, ручной restart, uncaughtException), совпавшем с блипом Atlas M0,
// процесс падает, и restartPolicyMaxRetries в railway.json сгорает за
// секунды — сервис выключается насовсем до ручного вмешательства.
//
// 60 попыток × 5 с = 5 минут ожидания Atlas при старте: railway.json
// `healthcheckTimeout: 300` — всё окно, в течение которого Railway опрашивает
// `/api/health` нового инстанса до вердикта FAILED (RUNBOOK §2; до аудита
// 2026-10-01 стояло 30 с и считалось таймаутом одной проверки — это не так,
// старт дольше полуминуты ронял выкат) — те же 5 минут, что и здесь.
// Число согласовано с новым restartPolicyMaxRetries (RUNBOOK §8.3).
//
// Аудит 2026-10-01 (F67): у драйвера не было бюджета на операцию — при паузе
// Atlas M0 запрос висел до клиентских 30 с (web/src/api/http.ts
// API_TIMEOUT_MS), клиент повторял, а сервер дочитывал осиротевший запрос:
// нагрузка в стойле удваивалась. `timeoutMS` (CSOT драйвера mongodb@7)
// обрывает операцию раньше клиента: 500 с requestId и error-логом, клиент
// повторит сам. Выбор сервера отдельно не ужимаем: по CSOT он ограничен
// min(serverSelectionTimeoutMS, остаток timeoutMS), а 10 с на время выборов
// primary в Atlas (до ~12 с) дали бы ложных отказов. `connect()` под
// timeoutMS не попадает — retryAttempts/retryDelay выше не затронуты.
import type { mongo } from 'mongoose';
import type { NodeEnv } from '../config/env.validation';
import { MONGO_RUNTIME_ADAPTERS } from './mongo-runtime-adapters';

export const MONGO_CONNECT_RETRY_ATTEMPTS = 60;
export const MONGO_CONNECT_RETRY_DELAY_MS = 5_000;
// Меньше API_TIMEOUT_MS клиента (30 с, web/src/api/http.ts) — иначе первым
// сдаётся клиент, и сервер дочитывает запрос, которого никто не ждёт.
export const MONGO_OPERATION_TIMEOUT_MS = 20_000;

export interface MongooseOptionsInput {
  uri: string;
  nodeEnv: NodeEnv;
}

export interface MongooseConnectOptions {
  uri: string;
  autoIndex: boolean;
  runtimeAdapters: mongo.MongoClientOptions['runtimeAdapters'];
  retryAttempts: number;
  retryDelay: number;
  timeoutMS: number;
}

// Чистая функция вместо инлайна в app.module.ts — сама логика (что и
// сколько раз пробовать подключаться) тестируется без поднятия
// Nest/ConfigModule.
export function mongooseOptions(input: MongooseOptionsInput): MongooseConnectOptions {
  return {
    uri: input.uri,
    // В production индексы строит только IndexSyncService при старте
    // (CLAUDE.md «Данные») — автостроение на живом трафике конкурирует
    // с этим и маскирует ошибку индекса до первого рестарта.
    autoIndex: input.nodeEnv !== 'production',
    // mongo-runtime-adapters.ts: обход бага хендшейка mongodb@7.6+ под Jest.
    runtimeAdapters: MONGO_RUNTIME_ADAPTERS,
    retryAttempts: MONGO_CONNECT_RETRY_ATTEMPTS,
    retryDelay: MONGO_CONNECT_RETRY_DELAY_MS,
    timeoutMS: MONGO_OPERATION_TIMEOUT_MS,
  };
}
