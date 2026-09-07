import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

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
