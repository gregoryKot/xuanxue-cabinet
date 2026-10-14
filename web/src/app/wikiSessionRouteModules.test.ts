// Сессия, общая с wiki (ADR-0183): мост «/wiki» и страница «/logout» — свои
// чанки. Загрузчик зовём по-настоящему: опечатка в пути модуля иначе всплыла
// бы только в браузере, пустым экраном под Suspense.
import { describe, expect, it } from 'vitest';
import { matchRoute } from './routeMatch';
import { ROUTE_MODULES } from './routeModules';

describe('WIKI_SESSION_ROUTE_MODULES', () => {
  it('«/wiki» и «/logout» находятся по адресу и в фоне не греются', () => {
    expect(matchRoute('/wiki')).toBe(ROUTE_MODULES.wikiResume);
    expect(matchRoute('/logout')).toBe(ROUTE_MODULES.logout);
    expect(ROUTE_MODULES.wikiResume.warm).toBe(false);
    expect(ROUTE_MODULES.logout.warm).toBe(false);
  });

  it('загрузчики приводят экраны', async () => {
    await expect(ROUTE_MODULES.wikiResume.load()).resolves.toHaveProperty('default');
    await expect(ROUTE_MODULES.logout.load()).resolves.toHaveProperty('default');
  });
});
