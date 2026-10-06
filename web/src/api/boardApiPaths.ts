// Путь доски ученика (ADR-0172, ADR-0173) — отдельным файлом, не apiPaths.ts:
// тот стоит на потолке храповика размера, тот же приём, что у
// paymentsApiPaths.ts. Запрос идёт через карту маршрутов (useMyBoard.ts);
// строка нужна предзагрузке первого экрана (routeModules.ts): ключ
// prefetchCache.ts должен совпасть с запросом хука.
import { apiRoutePath } from './apiRoute';

export const MY_BOARD_PATH = apiRoutePath('GET /me/board');
