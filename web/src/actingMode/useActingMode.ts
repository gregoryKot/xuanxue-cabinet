// Переключатель режима (`PUT /me/student-mode`, ADR-0163, и `PUT /me/teacher-mode`,
// ADR-0190) — логика одна на два режима и на два места: секцию в «Профиле»
// (ActingModeSection.tsx) и плашку в оболочке (ActingModeBanner.tsx), чтобы
// «выйти из режима» не писалось дважды (CLAUDE.md «Одна механика — один компонент»).
//
// Ответ — `MeDto` целиком, `applyMe` кладёт его сразу: меню, экраны и плашка
// перестраиваются без второго `GET /auth/me` (ADR-0087, образец —
// telegram/useNoTelegram.ts). После этого человека ведём на первый экран той
// роли, в которую он попал: маршрут прежней может не открываться новой
// (штатный «/exams» ученику закрыт, а «/board» у штата открыт, но под штатным
// меню читался бы случайным) — без перехода был бы редирект AppShell или
// чужой экран под новой навигацией.
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SetActingModeInput } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { ApiError } from '../api/http';
import { useAuth } from '../auth/AuthProvider';
import { rootPathFor } from '../app/screenAccess';
import { ACTING_MODES, type ActingMode } from './actingModes';

/** Сбой, у которого нет своего текста от сервера (не `ApiError`). Сетевой сбой
 * и отказ сервера приходят `ApiError` со своими словами — их показываем как есть. */
export const ACTING_MODE_SWITCH_FAILED_MESSAGE =
  'Не удалось переключить режим. Попробуйте ещё раз.';

export interface UseActingModeResult {
  pending: boolean;
  error: string | null;
  set: (enabled: boolean) => Promise<void>;
}

export function useActingMode(mode: ActingMode): UseActingModeResult {
  const { applyMe } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(
    async (enabled: boolean) => {
      setPending(true);
      setError(null);
      try {
        const body: SetActingModeInput = { enabled };
        const next = await apiRoute(ACTING_MODES[mode].route, { body });
        applyMe(next);
        void navigate(rootPathFor(next));
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : ACTING_MODE_SWITCH_FAILED_MESSAGE,
        );
      } finally {
        setPending(false);
      }
    },
    [applyMe, mode, navigate],
  );

  return { pending, error, set };
}
