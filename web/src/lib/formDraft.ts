// Черновик формы редактора в localStorage (ADR-0052) — переживает уход со
// страницы: кнопка «Назад», ссылка «К вопросам», вкладка нижней панели,
// закрытие вкладки, выгрузку вкладки iOS при выборе фото. Владелец так терял
// вопрос с картинками — набранное нигде не сохранялось, кроме памяти React.
// Чистая работа с хранилищем; React-обвязка — hooks/useFormDraft.ts.
//
// `now` — параметром, не Date.now() внутри (CLAUDE.md «Детерминизм»): тест
// проверяет просрочку записи без реального ожидания недели.
const DRAFT_KEY_PREFIX = 'xuanxue.draft.';
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 суток (ADR-0052)

interface StoredDraft {
  value: unknown;
  savedAt: number;
}

function storageKey(key: string): string {
  return `${DRAFT_KEY_PREFIX}${key}`;
}

/** Отличает нашу запись от чужого мусора под тем же ключом: чужая форма или
 * ручная правка localStorage не пройдёт по форме, даже если это валидный JSON. */
function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return 'value' in record && typeof record.savedAt === 'number';
}

/**
 * Черновик по ключу. `null` — записи нет, она просрочена (старше 7 суток) или
 * битая (не наш JSON, чужая форма) — в двух последних случаях запись тут же
 * удаляется, чтобы не копить мусор в хранилище.
 */
export function readDraft<T>(key: string, now: number): T | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(storageKey(key));
  } catch {
    return null; // приватный режим Safari и подобные — считаем, что черновика нет
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearDraft(key); // битый JSON — не наша запись, стираем мусор
    return null;
  }

  if (!isStoredDraft(parsed) || now - parsed.savedAt > DRAFT_TTL_MS) {
    clearDraft(key);
    return null;
  }
  return parsed.value as T;
}

/** Пишет черновик. Приватный режим Safari бросает на записи, переполнение
 * квоты — тоже: сбой хранилища не должен ронять форму, поэтому ошибка молча
 * проглатывается — теряем только автосохранение, не саму работу человека. */
export function writeDraft(key: string, value: unknown, now: number): void {
  try {
    const stored: StoredDraft = { value, savedAt: now };
    localStorage.setItem(storageKey(key), JSON.stringify(stored));
  } catch {
    // недоступное или переполненное хранилище — форма продолжает работать без черновика
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(storageKey(key));
  } catch {
    // недоступное хранилище — удалять нечего
  }
}

/** Все черновики разом — явный выход из кабинета (useLogout.ts): в общем
 * localStorage вкладки должны остаться только чужие ключи. */
export function clearAllDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const storedKey = localStorage.key(i);
      if (storedKey !== null && storedKey.startsWith(DRAFT_KEY_PREFIX)) {
        keys.push(storedKey);
      }
    }
    keys.forEach((storedKey) => localStorage.removeItem(storedKey));
  } catch {
    // недоступное хранилище — чистить нечего
  }
}
