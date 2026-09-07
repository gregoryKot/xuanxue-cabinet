// Конфигурация экрана входа — GET /auth/config (@Public(), без сессии). Без
// telegramBotId кнопка входа не рисуется. Сетевой сбой (ApiError.status===0)
// — отдельное состояние: LoginScreen показывает «Нет связи…» с повтором, а
// не «бот не настроен» (эти два случая нельзя путать — ревью п.4).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthConfigDto } from '@xuanxue/shared';
import { apiFetch } from '../api/http';

type AuthConfigStatus = 'loading' | 'ok' | 'offline';

export interface UseAuthConfigResult {
  config: AuthConfigDto | null;
  status: AuthConfigStatus;
  reload: () => Promise<void>;
}

export function useAuthConfig(): UseAuthConfigResult {
  const [config, setConfig] = useState<AuthConfigDto | null>(null);
  const [status, setStatus] = useState<AuthConfigStatus>('loading');
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const thisRequest = (requestId.current += 1);
    setStatus('loading');
    try {
      const dto = await apiFetch<AuthConfigDto>('/auth/config');
      if (requestId.current !== thisRequest) return;
      setConfig(dto);
      setStatus('ok');
    } catch {
      if (requestId.current !== thisRequest) return;
      // Любая ошибка запроса (сеть, 500, битый JSON) — offline: сервер не
      // сказал, настроен ли бот, поэтому LoginScreen не имеет права
      // утверждать «не настроен» — только «нет связи» с кнопкой «Повторить».
      setConfig(null);
      setStatus('offline');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { config, status, reload };
}
