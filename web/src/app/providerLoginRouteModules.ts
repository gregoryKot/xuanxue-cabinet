// Страницы возврата из внешних входов — Google (ADR-0145) и Telegram по OpenID
// Connect (ADR-0187) — часть ROUTE_MODULES (routeModules.ts), вынесены отдельным
// файлом по той же причине, что wikiSessionRouteModules.ts: в самой таблице уже
// за четыреста строк, а храповик размера не даёт ей расти.
//
// Оба публичные, как login/emailLogin: не требуют сессии (человек как раз
// входит), вошедшему чанк не нужен заранее (`warm: false`). Адреса записаны у
// провайдеров как `redirect_uri` (Google Cloud Console, BotFather → «Allowed
// URLs», RUNBOOK §5) — менять путь нельзя без правки у них.
import {
  GOOGLE_LOGIN_CALLBACK_PATH,
  TELEGRAM_LOGIN_CALLBACK_PATH,
} from '@xuanxue/shared';
import type { RouteModule } from './routeModules';

export const PROVIDER_LOGIN_ROUTE_MODULES = {
  googleLogin: {
    path: GOOGLE_LOGIN_CALLBACK_PATH,
    load: () => import('../auth/GoogleLoginCallbackScreen'),
    warm: false,
  },
  telegramLogin: {
    path: TELEGRAM_LOGIN_CALLBACK_PATH,
    load: () => import('../auth/TelegramLoginCallbackScreen'),
    warm: false,
  },
} satisfies Record<string, RouteModule>;
