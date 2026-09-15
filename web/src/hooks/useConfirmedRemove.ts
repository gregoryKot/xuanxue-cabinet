// Подтверждение перед удалением сущности листа (форма экзамена, вопрос-
// черновик) — общая механика с components/ConfirmDialog.tsx (CLAUDE.md
// «Одна механика — один компонент»): открыть диалог, дождаться ответа
// сервера, закрыть весь лист только при успехе и только после того, как сам
// диалог подтверждения уже закрылся. Раньше «Удалить» на ExamSheet/
// ExamItemSheet срабатывало с одного касания без подтверждения и отмены — на
// телефоне рядом с ней другие кнопки (аудит 2026-09-15, важно №2). Вынесено
// из channels/ChannelSheet.tsx (там та же связка confirming/removed+эффект
// была написана вручную): вторая и третья копии одного и того же — сюда, а
// не по файлам (jscpd, CLAUDE.md «Дубли и мёртвый код»).
import { useEffect, useState } from 'react';

export interface UseConfirmedRemoveResult {
  /** Диалог подтверждения открыт. */
  confirming: boolean;
  /** Клик по «Удалить»/«Убрать» — открывает диалог, ничего ещё не удаляет. */
  requestRemove: () => void;
  /** «Отмена» в диалоге — ничего не удалено. */
  cancelRemove: () => void;
  /** Подтверждение в диалоге — реально вызывает `remove()`. */
  confirmRemove: () => Promise<void>;
}

export function useConfirmedRemove(
  remove: () => Promise<boolean>,
  goBack: () => void,
): UseConfirmedRemoveResult {
  const [confirming, setConfirming] = useState(false);
  const [removed, setRemoved] = useState(false);

  // Не закрываем лист прямо в confirmRemove: ConfirmDialog после этого
  // вызова сам делает единственный navigate(-1) (закрывает подтверждение) —
  // вызвать goBack() ещё и тут значило бы два navigate(-1) в одном такте, и
  // история путается (useHistorySheet.ts, ревью п.5). Закрытие всего листа
  // при успехе — эффект, срабатывает уже после того, как подтверждение
  // действительно закрылось.
  useEffect(() => {
    if (removed && !confirming) goBack();
    // goBack (useHistorySheet) — новая функция на каждый рендер: добавление
    // её в зависимости вызывало бы повторный navigate(-1) на каждый рендер
    // после закрытия, а не один раз по факту «сущности больше нет».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removed, confirming]);

  async function confirmRemove(): Promise<void> {
    if (await remove()) setRemoved(true);
    // Сбой remove() ничего не меняет здесь: serverError уже выставлен внутри
    // remove() (useEntityForm), ConfirmDialog всё равно закроется сам — текст
    // ошибки останется виден на самом листе.
  }

  return {
    confirming,
    requestRemove: () => setConfirming(true),
    cancelRemove: () => setConfirming(false),
    confirmRemove,
  };
}
