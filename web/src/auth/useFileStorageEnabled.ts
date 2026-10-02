// Подключено ли файловое хранилище R2 (ADR-0057) — `fileStorageEnabled` из
// GET /auth/config. Одна проверка на все формы с файлами (материал, вопрос
// экзамена — ADR-0133), CLAUDE.md «Одна механика — один компонент». Пока
// конфигурация не пришла или не пришла вовсе — `false`: безопаснее поле
// ссылки, чем кнопка файла, которая ответит 503.
//
// Экран, у которого конфигурация уже на руках (AttemptScreen.tsx держит
// свой useAuthConfig ради имени бота), зовёт чистую `isFileStorageEnabled`,
// а не хук: второй хук — второй GET /auth/config на каждое открытие
// попытки, вдвое больше запросов в бакет троттлера на один NAT (аудит
// 2026-10-01, F41). Что значит «включено», по-прежнему решается здесь одной
// строкой.
import type { AuthConfigDto } from '@xuanxue/shared';
import { useAuthConfig } from './useAuthConfig';

export function isFileStorageEnabled(config: AuthConfigDto | null): boolean {
  return config?.fileStorageEnabled === true;
}

export function useFileStorageEnabled(): boolean {
  return isFileStorageEnabled(useAuthConfig().config);
}
