import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Ожидание findBy*/waitFor по умолчанию — 1 с. Ленивые маршруты (React.lazy)
// и экраны с двумя-тремя запросами под нагрузкой CI и параллельных прогонов
// не успевали, тесты мигали (App.test.tsx, LoginScreen.test.tsx, 2026-09-08).
// Порог — не про скорость, а про то, что элемент появится; поднимаем его в
// одном месте, а не в каждом тесте. Тест на «не появляется» это не замедляет:
// такие проверки идут через queryBy*, не через waitFor.
const ASYNC_UTIL_TIMEOUT_MS = 5000;
configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

// test.globals выключен, поэтому testing-library не регистрирует cleanup сама —
// без него разметка копится между `it` в одном файле и `getByRole` находит
// несколько элементов вместо одного. Одно место для всех тестов web.
afterEach(() => {
  cleanup();
});

// jsdom не реализует matchMedia (useIsMobile.ts, переключатель список/сетка
// расписания на 768px) — по умолчанию «не мобильный», тесты конкретной ветки
// переопределяют через vi.stubGlobal('matchMedia', ...).
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
