// Чистые форматтеры экрана «Сбои» (`/dev/errors`, ADR-0132) — без сети и DOM,
// CLAUDE.md «Тесты»: юнит-тест без Mongo и без DI.
import {
  APP_ERROR_KIND_LABELS,
  pluralRu,
  type AppErrorKind,
  type AppErrorSource,
  type PluralForms,
} from '@xuanxue/shared';

const SOURCE_LABELS: Record<AppErrorSource, string> = {
  browser: 'Браузер',
  server: 'Сервер',
};

const APP_ERROR_FORMS: PluralForms = {
  one: 'сбой',
  few: 'сбоя',
  many: 'сбоев',
  other: 'сбоя',
};

/** Подпись вида сбоя с заглавной буквы — `APP_ERROR_KIND_LABELS` (shared/src/
 * app-errors.ts) хранит её со строчной, чтобы вставать в середину фразы
 * алёрта Telegram; экран поднимает первую букву сам. */
export function formatKindLabel(kind: AppErrorKind): string {
  const label = APP_ERROR_KIND_LABELS[kind];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatSourceLabel(source: AppErrorSource): string {
  return SOURCE_LABELS[source];
}

/** Число раздела (CLAUDE.md «Продуктовая фича = число в своём разделе») —
 * честное пустое состояние на 0 (сервер уже исключил `chunk` из счётчика,
 * shared/src/app-errors.ts). */
export function formatLast24h(count: number): string {
  if (count <= 0) return 'За сутки сбоев не было.';
  return `За последние сутки — **${count} ${pluralRu(count, APP_ERROR_FORMS)}**.`;
}
