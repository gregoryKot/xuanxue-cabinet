// Возврат из Google и Telegram — свои чанки. Загрузчик зовём по-настоящему:
// опечатка в пути модуля иначе всплыла бы только в браузере, пустым экраном под
// Suspense. Адрес `/login/telegram` не должен провалиться ни в `/login`, ни в
// соседний `/login/google`.
import { describe, expect, it } from 'vitest';
import { TELEGRAM_LOGIN_CALLBACK_PATH } from '@xuanxue/shared';
import { matchRoute } from './routeMatch';
import { ROUTE_MODULES } from './routeModules';

describe('PROVIDER_LOGIN_ROUTE_MODULES', () => {
  it('«/login/google» и «/login/telegram» находятся по адресу и в фоне не греются', () => {
    expect(matchRoute('/login/google')).toBe(ROUTE_MODULES.googleLogin);
    expect(matchRoute(TELEGRAM_LOGIN_CALLBACK_PATH)).toBe(ROUTE_MODULES.telegramLogin);
    expect(ROUTE_MODULES.telegramLogin.path).toBe('/login/telegram');
    expect(ROUTE_MODULES.googleLogin.warm).toBe(false);
    expect(ROUTE_MODULES.telegramLogin.warm).toBe(false);
  });

  it('у возвратов разные чанки, а загрузчики приводят экраны', async () => {
    expect(ROUTE_MODULES.telegramLogin.load).not.toBe(ROUTE_MODULES.googleLogin.load);
    await expect(ROUTE_MODULES.googleLogin.load()).resolves.toHaveProperty('default');
    await expect(ROUTE_MODULES.telegramLogin.load()).resolves.toHaveProperty('default');
  });
});
