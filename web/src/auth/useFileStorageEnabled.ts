// Подключено ли файловое хранилище R2 (ADR-0057) — `fileStorageEnabled` из
// GET /auth/config. Одна проверка на все формы с файлами (материал, вопрос
// экзамена — ADR-0133), CLAUDE.md «Одна механика — один компонент». Пока
// конфигурация не пришла или не пришла вовсе — `false`: безопаснее поле
// ссылки, чем кнопка файла, которая ответит 503.
import { useAuthConfig } from './useAuthConfig';

export function useFileStorageEnabled(): boolean {
  return useAuthConfig().config?.fileStorageEnabled === true;
}
