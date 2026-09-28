// Рендерится в App.tsx рядом с FirstScreenPrefetch — внутри AuthProvider и
// BrowserRouter (main.tsx), снаружи Routes, чтобы жить одну жизнь на всё
// приложение, а не пересоздаваться при смене экрана (ADR-0143). Сам ничего
// не рисует — вся работа в useAnalytics.ts.
import { useAnalytics } from './useAnalytics';

export function AnalyticsTracker(): null {
  useAnalytics();
  return null;
}
