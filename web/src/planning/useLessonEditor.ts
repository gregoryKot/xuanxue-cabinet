// Данные страницы занятия — `/planning/new` и `/planning/:lessonId`
// (страница со своим адресом вместо листа поверх списка, ADR-0033). Чтение
// записи по адресу, создание и сохранение — общий hooks/useEntityEditor.ts;
// домен добавляет два действия самой даты занятия: запись и «отправить
// ссылку сейчас» (docs/PLAN.md §6 п.3).
import { useCallback } from 'react';
import type {
  AddRecordingInput,
  BroadcastDto,
  CreateLessonInput,
  LessonDto,
  UpdateLessonInput,
} from '@xuanxue/shared';
import { apiFetch } from '../api/http';
import { useEntityEditor, type UseEntityEditorResult } from '../hooks/useEntityEditor';

const LESSONS_PATH = '/lessons';
const LOAD_ERROR_MESSAGE = 'Не удалось открыть занятие. Попробуйте ещё раз.';

export interface UseLessonEditorResult extends UseEntityEditorResult<
  LessonDto,
  CreateLessonInput,
  UpdateLessonInput
> {
  /** Ответ сервера — занятие целиком: список записей на странице обновляется
   * из него (CLAUDE.md «Read-after-write»). Перечитывать занятие целиком
   * нельзя — страница на время запроса вернулась бы к скелетону и потеряла
   * несохранённые правки темы. */
  addRecording: (id: string, input: AddRecordingInput) => Promise<LessonDto>;
  sendNow: (id: string) => Promise<void>;
}

export function useLessonEditor(lessonId: string | undefined): UseLessonEditorResult {
  const editor = useEntityEditor<LessonDto, CreateLessonInput, UpdateLessonInput>(
    LESSONS_PATH,
    lessonId,
    LOAD_ERROR_MESSAGE,
  );

  const addRecording = useCallback(
    (id: string, input: AddRecordingInput) =>
      apiFetch<LessonDto>(`${LESSONS_PATH}/${id}/recording`, {
        method: 'POST',
        body: input,
      }),
    [],
  );

  // Ответ (рассылка) странице не нужен: о результате говорит сама кнопка
  // («Ссылка уйдёт в ближайшую минуту», useSendNow.ts), а статус рассылки
  // виден в списке занятий — он перечитывается при возврате на него.
  const sendNow = useCallback(async (id: string) => {
    await apiFetch<BroadcastDto>(`${LESSONS_PATH}/${id}/send-now`, { method: 'POST' });
  }, []);

  return { ...editor, addRecording, sendNow };
}
