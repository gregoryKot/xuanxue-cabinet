// Все действия страницы-редактора, которые ведут либо к успеху (уход на
// список), либо к ошибке на месте: «Сохранить», смена статуса, удаление.
// Провал сохранения/статуса прокручивает к первой ошибке
// (lib/scrollToFirstAlert.ts, ADR-0046) — кнопка стоит внизу страницы,
// ошибка рисуется у поля наверху. Удаление — через уже существующий
// useConfirmedRemove (диалог подтверждения), тот же goToList на успех.
//
// Общая механика для редактора вопроса и редактора экзамена (CLAUDE.md «Одна
// механика — один компонент») — оба файла и так на пределе лимита строк, а
// врозь submit/changeStatus/remove с одинаковым «успех → goToList» жили бы
// почти идентичным кодом в обоих (jscpd поймал именно это разделение как
// клон, когда submit/changeStatus уже были общими, а remove — ещё нет).
import { useRef, type FormEvent, type RefObject } from 'react';
import { scrollToFirstAlertSoon } from '../lib/scrollToFirstAlert';
import { useConfirmedRemove, type UseConfirmedRemoveResult } from './useConfirmedRemove';

export interface UseEditorFormActionsResult<TStatus extends string> {
  formRef: RefObject<HTMLFormElement | null>;
  handleSubmit: (event: FormEvent) => Promise<void>;
  handleChangeStatus: (status: TStatus) => Promise<void>;
  removeConfirm: UseConfirmedRemoveResult;
}

export function useEditorFormActions<TStatus extends string>(
  submit: () => Promise<boolean>,
  changeStatus: (status: TStatus) => Promise<boolean>,
  remove: () => Promise<boolean>,
  goToList: () => void,
): UseEditorFormActionsResult<TStatus> {
  const formRef = useRef<HTMLFormElement>(null);
  const removeConfirm = useConfirmedRemove(remove, goToList);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (await submit()) goToList();
    else scrollToFirstAlertSoon(formRef.current);
  }

  async function handleChangeStatus(status: TStatus): Promise<void> {
    if (await changeStatus(status)) goToList();
    else scrollToFirstAlertSoon(formRef.current);
  }

  return { formRef, handleSubmit, handleChangeStatus, removeConfirm };
}
