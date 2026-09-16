// Запуск предзагрузки данных первого экрана — ровно один раз, сразу как
// узнали роль (первый непустой ответ `/auth/me`), не на каждый
// `refresh()`/переход между экранами.
//
// Компонент вставлен в App.tsx между `<AuthProvider>` и `<Suspense>` —
// обязательно снаружи: пока чанк экрана не пришёл, всё под `<Suspense>`
// (RequireAuth, AppShell) не коммитится, и его эффекты не запускаются — та
// самая последовательность «чанк экрана → данные экрана», которую убирает
// эта задача. Здесь эффект стартует, как только известна роль, параллельно с
// чанком, который уже качается (main.tsx).
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { prefetchFirstScreen } from './firstScreenPrefetch';

// Не экспортирован: единственный потребитель — компонент ниже, снаружи хук
// не нужен (knip иначе ловит мёртвый экспорт).
function useFirstScreenPrefetch(): void {
  const { me } = useAuth();
  const { pathname } = useLocation();
  const firedOnce = useRef(false);

  useEffect(() => {
    if (firedOnce.current || !me) return;
    firedOnce.current = true;
    prefetchFirstScreen(pathname, me);
  }, [me, pathname]);
}

/** Компонент-носитель хука — сам ничего не рисует. */
export function FirstScreenPrefetch(): null {
  useFirstScreenPrefetch();
  return null;
}
