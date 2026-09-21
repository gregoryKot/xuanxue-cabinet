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
// `healthcheckTimeout: 30` — таймаут ОДНОЙ проверки `/api/health`, а не
// общего ожидания раскатки (RUNBOOK §2: Railway держит старый инстанс и
// продолжает опрашивать health, пока новый не поднимется или не истечёт
// таймаут раскатки) — 5 минут внутреннего ожидания не конфликтуют с этим.
// Число согласовано с новым restartPolicyMaxRetries (RUNBOOK §8.3).
import type { mongo } from 'mongoose';
import type { NodeEnv } from '../config/env.validation';
import { MONGO_RUNTIME_ADAPTERS } from './mongo-runtime-adapters';

export const MONGO_CONNECT_RETRY_ATTEMPTS = 60;
export const MONGO_CONNECT_RETRY_DELAY_MS = 5_000;

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
  };
}
