// Заголовок страницы вопроса. Своего названия у вопроса нет — только
// формулировка, а она бывает в три строки и антиквой в 34 пункта занимает
// пол-экрана. Берём первые слова: этого хватает, чтобы узнать вопрос, к
// которому вернулись по ссылке. Чистая функция — проверяется без DOM
// (CLAUDE.md «Тесты»).
const NEW_ITEM_TITLE = 'Новый вопрос';
const TITLE_MAX_WORDS = 6;
const ELLIPSIS = '…';

/** `null` — вопроса ещё нет на сервере. Пустая формулировка (черновик
 * завели и ушли) — тоже «Новый вопрос»: пустой заголовок хуже честного. */
export function examItemEditorTitle(prompt: string | null): string {
  const words = (prompt ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return NEW_ITEM_TITLE;
  const head = words.slice(0, TITLE_MAX_WORDS).join(' ');
  // Хвостовая пунктуация перед многоточием читается как опечатка:
  // «Зачем придумали тайцзи?…» — убираем её вместе с обрезанным хвостом.
  if (words.length <= TITLE_MAX_WORDS) return head;
  return `${head.replace(/[.,;:!?—-]+$/u, '')}${ELLIPSIS}`;
}
