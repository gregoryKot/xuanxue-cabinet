// Ввод в первую микрозадачу после первого коммита, пока пассивные эффекты
// (useEffect) первой отрисовки ещё стоят в очереди планировщика React.
//
// Зачем. `render` из testing-library оборачивает отрисовку в act, и act
// заранее прогоняет все эффекты — тест не видит окна между «на экране» и
// «эффекты отработали». А оно есть: экран появляется по данным из сети, то есть
// обычным (не синхронным) обновлением, и его эффекты выполняются отдельной
// задачей чуть позже. Тест, который после `findBy…` сразу печатает, попадает то
// до этой задачи, то после — как повезёт с нагрузкой на машину. Так мигал
// PaymentReminderSection.test.tsx: эффект монтирования складывал старый
// снимок формы в очередь обновлений после ввода и затирал его (2026-09-29, см.
// useSavedDraft.ts). Здесь порядок задан жёстко: сначала ввод, потом эффекты.
//
// `run` выполняется синхронно; ввод внутри него — обычный `fireEvent`
// (он сам обёрнут в act и досчитывает всё, что стоит в очереди). Без ожиданий по
// времени: коммит ловит MutationObserver.
import { act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

interface ActEnvironment {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}

export async function renderBeforeEffects(
  ui: ReactElement,
  run: (container: HTMLElement) => void,
): Promise<void> {
  const environment = globalThis as ActEnvironment;
  const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  const committed = new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(container, { childList: true, subtree: true });
  });

  // Вне act React ругается на каждое обновление, а тут оно нужно именно вне act.
  environment.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    root.render(ui);
    await committed;
    run(container);
  } finally {
    act(() => root.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    container.remove();
  }
}
