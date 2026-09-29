// Черновик формы поверх сохранённых настроек школы. Одно место для всех полей
// экрана «Шаблоны» (usePaymentReminderSection.ts, useMinutesField.ts,
// useSettingsTextField.ts, TemplatesScreen.tsx) — CLAUDE.md «Одна механика —
// один компонент».
//
// Раньше каждое поле держало копию так:
//   useEffect(() => setForm(fromSaved(settings)), [settings?.updatedAt])
// и это ломалось двумя способами (2026-09-29, мигал «новое время включает
// «Сохранить напоминание»» в PaymentReminderSection.test.tsx):
//   1. Эффект срабатывает и при монтировании, хотя форма уже начата с тех же
//      сохранённых значений. Это отложенная запись «старого снимка»: если ввод
//      попал между коммитом и пассивными эффектами, снимок встаёт в очередь
//      обновлений после ввода и затирает его. Человек в это окно (миллисекунды)
//      не попадает, а тест, печатающий сразу после `findBy…`, попадает то да,
//      то нет — в зависимости от того, что раньше получит слово: таймер
//      `waitFor` или задача планировщика React.
//   2. `updatedAt` общий на все настройки. Сохранил «Школу» — у «Оплат» и у
//      шаблонов постов пришёл новый `updatedAt`, и всё, что набрано там и ещё
//      не сохранено, сбрасывалось. Это уже баг для учителя, а не для теста.
// Здесь синхронизация делается во время рендера (так React рекомендует
// подстраивать состояние под новую пропсу: без пассивного эффекта нет окна,
// в которое можно вклиниться) и по полям: поле, которое учитель не трогал,
// берёт новое сохранённое, тронутое — остаётся как набрано.
//
// Своё «Сохранить» — отдельный случай: экран показывает то, что сервер вернул
// после записи (обрезанное, приведённое к числу; ADR-0087), поэтому поля,
// которые ушли на сервер, тоже считаются не тронутыми (`submit`).
import { useState, type Dispatch, type SetStateAction } from 'react';

type Scalar = string | number | boolean | null;
/** Значение поля или плоская запись из значений полей. Запись — `type`, а не
 * `interface`: у интерфейса нет неявной индексной сигнатуры. */
export type Draft = Scalar | { readonly [field: string]: Scalar };

function isRecord(value: Draft): value is { readonly [field: string]: Scalar } {
  return typeof value === 'object' && value !== null;
}

// Поле «не тронуто», если совпадает с прежним сохранённым или с тем, что мы
// сами только что отправили, — тогда его место занимает новое сохранённое.
// Иначе это набранное учителем.
function keepTouched<F extends Draft>(draft: F, before: F, after: F, sent: Sent<F>): F {
  if (isRecord(draft) && isRecord(before) && isRecord(after)) {
    const sentRecord = sent && isRecord(sent.value) ? sent.value : null;
    const merged: Record<string, Scalar | undefined> = {};
    for (const field of Object.keys(after)) {
      const value = draft[field];
      const untouched =
        Object.is(value, before[field]) ||
        (sentRecord !== null && Object.is(value, sentRecord[field]));
      merged[field] = untouched ? after[field] : value;
    }
    // Ключи те же, что у `after`, значения — из draft или after: тип не меняется.
    return merged as F;
  }
  const untouched =
    Object.is(draft, before) || (sent !== null && Object.is(draft, sent.value));
  return untouched ? after : draft;
}

// Обёртка, а не сам объект: отправленным значением бывает и `null`.
type Sent<F> = { readonly value: F } | null;

/**
 * `saved` — сохранённое значение в виде формы, `version` — `settings.updatedAt`.
 * Первый рендер начинается с `saved`, дальше форма меняется только вводом и
 * новой `version` (после нашего «Сохранить», после чужого сохранения, после
 * первой загрузки настроек, когда экран открылся раньше ответа).
 *
 * `submit(sent, send)` оборачивает отправку: пока идёт запрос, помнит, что ушло
 * на сервер. Ответ с новой `version` заменит эти поля значением сервера, а при
 * отказе помнить нечего — набранное остаётся черновиком. Что учитель успел
 * набрать уже после отправки, тоже остаётся.
 */
export function useSavedDraft<F extends Draft>(
  saved: F,
  version: string | undefined,
): [
  F,
  Dispatch<SetStateAction<F>>,
  (sent: F, send: () => Promise<void>) => Promise<void>,
] {
  const [draft, setDraft] = useState<F>(saved);
  const [synced, setSynced] = useState({ version, saved });
  const [sent, setSent] = useState<Sent<F>>(null);

  if (synced.version !== version) {
    setSynced({ version, saved });
    setSent(null);
    setDraft((current) => keepTouched(current, synced.saved, saved, sent));
  }

  async function submit(value: F, send: () => Promise<void>): Promise<void> {
    setSent({ value });
    try {
      await send();
    } catch (error) {
      setSent(null);
      throw error;
    }
  }

  return [draft, setDraft, submit];
}
