import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { ACCESS_MESSAGE } from '@xuanxue/shared';
import { ASYNC_UTIL_TIMEOUT_MS } from './test-support/testTimeouts';

// web резолвит @xuanxue/shared из shared/dist (CommonJS-сборка, ADR-0016),
// поэтому забытый `npm run build --workspace=shared` не ломает импорт, а
// отдаёт undefined вместо константы: React рисует пустоту, и тест падает на
// «не нашли текст» рядом с пустым <p>. По логу такое падение выглядит как
// мигающий тест — на разборе JoinScreen.test.tsx с этого начинали дважды
// (2026-09-15). Пробуем ре-экспорт барабана: у сборки, которая старше самих
// исходников, его ещё нет.
if (!ACCESS_MESSAGE) {
  throw new Error(
    'Пакет @xuanxue/shared не собран (или собран до текущих исходников) — ' +
      'константы приезжают как undefined. Соберите его командой ' +
      '`npm run build --workspace=shared` и повторите прогон.',
  );
}

// Ожидание findBy*/waitFor по умолчанию — 1 с. Ленивые маршруты (React.lazy)
// и экраны с двумя-тремя запросами под нагрузкой CI и параллельных прогонов
// не успевали, тесты мигали (App.test.tsx, LoginScreen.test.tsx, 2026-09-08).
// Порог — не про скорость, а про то, что элемент появится; поднимаем его в
// одном месте, а не в каждом тесте. Тест на «не появляется» это не замедляет:
// такие проверки идут через queryBy*, не через waitFor. Само число и его
// связь с бюджетом теста — в test-support/testTimeouts.ts.
configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

// test.globals выключен, поэтому testing-library не регистрирует cleanup сама —
// без него разметка копится между `it` в одном файле и `getByRole` находит
// несколько элементов вместо одного. Одно место для всех тестов web.
afterEach(() => {
  cleanup();
});

// Черновик формы (ADR-0052) пишется в настоящий localStorage, а чистить его
// только в `afterEach` файла оказалось мало: свой хук файла срабатывает
// раньше общего `cleanup()` выше, и правка, зависшая от `user.type` под
// нагрузкой CI, успевала записать черновик заново уже после очистки —
// соседний тест открывал форму с чужим текстом и «Сохранить» в ней проходило
// валидацию (упал `ExamEditorScreen.test.tsx` в CI PR #225, локально тот же
// файл был зелёным). Чистка перед каждым тестом убирает и такой остаток:
// в начале теста хранилище пусто независимо от того, что натворил предыдущий.
beforeEach(() => {
  localStorage.clear();
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
