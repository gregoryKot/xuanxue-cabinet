// Данные страницы занятия — `/planning/new` и `/planning/:lessonId`
// (страница со своим адресом вместо листа поверх списка, ADR-0033). Чтение
// записи по адресу, создание и сохранение — общий hooks/useEntityEditor.ts;
// домен добавляет два действия самой даты занятия: запись и «отправить
// ссылку сейчас» (docs/PLAN.md §6 п.3).
import { useCallback } from 'react';
import type { AddRecordingInput, LessonDto } from '@xuanxue/shared';
import { LESSONS_PATH } from '../api/apiPaths';
import { apiRoute } from '../api/apiRoute';
import { useEntityEditor, type EntityEditorOf } from '../hooks/useEntityEditor';

const LOAD_ERROR_MESSAGE = 'Не удалось открыть занятие. Попробуйте ещё раз.';

export interface UseLessonEditorResult extends EntityEditorOf<typeof LESSONS_PATH> {
  /** Ответ сервера — занятие целиком: список записей на странице обновляется
   * из него (CLAUDE.md «Read-after-write»). Перечитывать занятие целиком
   * нельзя — страница на время запроса вернулась бы к скелетону и потеряла
   * несохранённые правки темы. */
  addRecording: (id: string, input: AddRecordingInput) => Promise<LessonDto>;
  sendNow: (id: string) => Promise<void>;
}

export function useLessonEditor(lessonId: string | undefined): UseLessonEditorResult {
  const editor = useEntityEditor(LESSONS_PATH, lessonId, LOAD_ERROR_MESSAGE);

  const addRecording = useCallback(
    (id: string, input: AddRecordingInput) =>
      apiRoute('POST /lessons/:id/recording', { params: { id }, body: input }),
    [],
  );

  // Ответ (рассылка) странице не нужен: о результате говорит сама кнопка
  // («Ссылка уйдёт в ближайшую минуту», useSendNow.ts), а статус рассылки
  // виден в списке занятий — он перечитывается при возврате на него.
  const sendNow = useCallback(async (id: string) => {
    await apiRoute('POST /lessons/:id/send-now', { params: { id } });
  }, []);

  return { ...editor, addRecording, sendNow };
}
