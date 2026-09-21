// React-обвязка над черновиком формы (lib/formDraft.ts, ADR-0052). Состояние
// формы редактора живёт здесь, а не в useEntityForm.ts — иначе тот не
// уложился бы в 150 строк (CLAUDE.md «Храповики»). `key === null` — форма
// без черновика, хук ведёт себя как обычный useState.
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { clearDraft, readDraft, writeDraft } from '../lib/formDraft';

export interface UseFormDraftResult<T> {
  state: T;
  setState: Dispatch<SetStateAction<T>>;
  /** Форма открылась с восстановленным черновиком. */
  restored: boolean;
  /** В форме есть правки, которых нет на сервере. */
  dirty: boolean;
  /** Кнопка «Убрать черновик» — стереть запись и вернуть форму к исходному. */
  discardDraft: () => void;
  /** Успешно сохранили — запись больше не нужна, состояние не трогаем. */
  forgetDraft: () => void;
}

interface DraftBootstrap<T> {
  /** initial() — база сравнения для `dirty` и цель discardDraft(), не то,
   * что показываем при восстановлении. */
  pristine: T;
  startState: T;
  restored: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Черновик накладывается на свежее initial(), а не подменяет его целиком:
 * форма живёт в браузере до 7 суток, а состояние формы за это время может
 * получить новые поля с очередным деплоем. Инцидент 2026-09-21: редактор
 * экзамена после #312 и #318 обзавёлся `questionsPerAttemptText` и
 * `requiredIds`, а черновик первого экзамена в localStorage был записан
 * прежним бандлом без них — `.trim()` на undefined ронял рендер в
 * ErrorBoundary («Что-то сломалось»), пока второй экзамен без черновика
 * открывался как ни в чём не бывало. Поле, которого в черновике нет,
 * берётся из initial(); лишнее поле старой формы остаётся — оно никому не
 * мешает и уйдёт при следующем сохранении. */
function mergeDraft<T>(pristine: T, draft: T): T {
  if (!isPlainObject(pristine) || !isPlainObject(draft)) return draft;
  return { ...pristine, ...draft };
}

function bootstrap<T>(key: string | null, initial: () => T): DraftBootstrap<T> {
  const pristine = initial();
  const draft = key === null ? null : readDraft<T>(key, Date.now());
  return draft === null
    ? { pristine, startState: pristine, restored: false }
    : { pristine, startState: mergeDraft(pristine, draft), restored: true };
}

export function useFormDraft<T>(
  key: string | null,
  initial: () => T,
): UseFormDraftResult<T> {
  // Ленивый инициализатор useState вызывается ровно один раз при монтировании
  // (CLAUDE.md «Детерминизм»: чтение хранилища — не на каждый рендер) —
  // второй заход на ту же страницу увидит черновик здесь же.
  const [{ pristine, startState, restored: startRestored }] = useState(() =>
    bootstrap(key, initial),
  );
  const [state, setState] = useState<T>(startState);
  // Отдельный useState, не константа из bootstrap: discardDraft() должен
  // погасить строку «восстановлено» — иначе после «Убрать черновик» заметка
  // осталась бы висеть над уже пустой формой.
  const [restored, setRestored] = useState(startRestored);

  const dirty = JSON.stringify(state) !== JSON.stringify(pristine);

  useEffect(() => {
    if (key === null) return;
    if (dirty) writeDraft(key, state, Date.now());
    else clearDraft(key);
  }, [key, dirty, state]);

  // Пока есть несохранённые правки — подтверждение браузера на закрытие и
  // перезагрузку вкладки (ADR-0052): это единственный перехват, который
  // видит и выгрузку вкладки iOS при выборе фото. Современные браузеры не
  // показывают свой текст из returnValue — это ожидаемо, preventDefault()
  // одного достаточно, чтобы показать системный диалог.
  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  const discardDraft = useCallback(() => {
    if (key !== null) clearDraft(key);
    setState(pristine);
    setRestored(false);
  }, [key, pristine]);

  const forgetDraft = useCallback(() => {
    if (key !== null) clearDraft(key);
  }, [key]);

  return { state, setState, restored, dirty, discardDraft, forgetDraft };
}
