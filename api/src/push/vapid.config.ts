// Три переменные VAPID (ADR-0092) в одном месте — тот же приём, что
// readR2Config (storage/r2.config.ts): половина набора — опечатка при
// настройке, не «push выключен» (CLAUDE.md «Логи»: тихий отказ — самая
// дорогая ошибка), поэтому и старт (env.vapid-group.ts), и это чтение
// требуют все три или ни одной.
//
// Push — риск за флагом (CLAUDE.md «Рискованная фича», ADR-0092
// «Последствия»): на проде этих переменных ещё нет, и без них кабинет обязан
// работать как раньше — вызывающий код сам решает, что делать с `null`
// (503 у подписки, `publicKey: null` у выдачи ключа), это чтение только
// читает.
import type { ConfigService } from '@nestjs/config';

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function readVapidConfig(config: ConfigService): VapidConfig | null {
  const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
  const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
  const subject = config.get<string>('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}
