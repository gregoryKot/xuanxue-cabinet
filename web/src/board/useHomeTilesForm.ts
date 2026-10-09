// Состояние диалога «Что показывать на главной» (ADR-0179): какие плитки скрыты в
// форме, сохранение и сбой сохранения. Логика выбора — чистая homeTilesForm.ts,
// здесь только состояние и запрос. `PUT /me/home-tiles` отвечает целым `MeDto`
// — кладём его в сессию (`applyMe`, ADR-0087), второго `GET /auth/me` нет, и
// главная перестраивается по ответу. `applyMe` берётся из useAuth() диалогом, не
// отсюда: так хук проверяется без <AuthProvider> (тот же приём, что у
// useProfileSetup.ts).
import { useState } from 'react';
import type { HomeTileKey, MeDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { errorFrom, type FormError } from '../components/FormServerError';
import {
  hasHomeTilesChanges,
  homeTilesBody,
  initialHidden,
  setTileShown,
} from './homeTilesForm';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить выбор. Попробуйте ещё раз.';

export interface UseHomeTilesFormResult {
  hidden: readonly HomeTileKey[];
  setShown: (key: HomeTileKey, show: boolean) => void;
  hasChanges: boolean;
  pending: boolean;
  error: FormError | null;
  /** `true` — сохранено и сессия обновлена: диалог можно закрывать. */
  save: () => Promise<boolean>;
}

export function useHomeTilesForm(
  me: MeDto,
  isStaffView: boolean,
  applyMe: (next: MeDto) => void,
): UseHomeTilesFormResult {
  const saved = me.homeHiddenTiles;
  const [hidden, setHidden] = useState(() => initialHidden(saved, isStaffView));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  async function save(): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const body = homeTilesBody(saved, hidden, isStaffView);
      applyMe(await apiRoute('PUT /me/home-tiles', { body }));
      return true;
    } catch (err) {
      setError(errorFrom(err, SAVE_ERROR_MESSAGE));
      return false;
    } finally {
      setPending(false);
    }
  }

  return {
    hidden,
    setShown: (key, show) => setHidden((prev) => setTileShown(prev, key, show)),
    hasChanges: hasHomeTilesChanges(saved, hidden, isStaffView),
    pending,
    error,
    save,
  };
}
