// Прогон валидации окружения при старте: падение со списком проблем лучше
// молчаливого дефолта. Отделено от схемы (env.validation.ts) — тот файл
// читает scripts/check-env-example.mjs регэкспом по полям класса `EnvSchema`,
// и расти вместе с числом правил ему больше некуда (CLAUDE.md «Храповики»).
//
// Правила, которые class-validator не выражает декоратором поля, живут
// соседями: «обязателен в production» — env.production-required.ts, «все
// четыре или ни одной» у R2 — env.r2-group.ts.
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EMPTY_AS_ABSENT_KEYS } from './env.empty-as-absent';
import { productionRequiredMessages } from './env.production-required';
import { r2GroupMessages } from './env.r2-group';
import { vapidGroupMessages } from './env.vapid-group';
import { EnvSchema } from './env.validation';

export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  const input: Record<string, unknown> = { ...raw };
  for (const key of EMPTY_AS_ABSENT_KEYS) {
    if (input[key] === '') delete input[key];
  }

  const instance = plainToInstance(EnvSchema, input, { enableImplicitConversion: true });
  const errors = validateSync(instance, { whitelist: true });
  const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));

  if (instance.NODE_ENV === 'production') {
    messages.push(...productionRequiredMessages(instance));
  }
  // Проверяется в любом окружении: половина набора R2 — опечатка при
  // настройке, а не «хранилище выключено» (ADR-0057).
  messages.push(...r2GroupMessages(instance));
  // Та же логика для VAPID (ADR-0092) — push не обязателен нигде, включая
  // production, но половина набора не проходит ни там, ни здесь.
  messages.push(...vapidGroupMessages(instance));

  if (messages.length > 0) {
    throw new Error(
      'Некорректная конфигурация окружения:\n' +
        messages.map((message) => `  - ${message}`).join('\n'),
    );
  }

  return instance;
}
