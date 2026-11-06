// Состояние страницы «Тема недели» (ADR-0197): текст, галочки, проверка до
// запроса и сама запись. Начальное состояние берётся из занятий недели один
// раз при монтировании — страница собирается только после загрузки списка
// (WeekTopicScreen.tsx), поэтому правки учителя не затираются перечитыванием.
import { useState } from 'react';
import type { LessonDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { errorFrom, type FormError } from '../components/FormServerError';
import { weekTopicDraft } from './weekTopic';

const SAVE_ERROR_MESSAGE = 'Не удалось сохранить тему. Попробуйте ещё раз.';
const NO_LESSONS_SELECTED_ERROR = 'Отметьте хотя бы одно занятие.';

export interface UseWeekTopicResult {
  topic: string;
  setTopic: (topic: string) => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  selectionError: string | null;
  serverError: FormError | null;
  pending: boolean;
  /** `true` — тема записана, можно уходить со страницы. */
  submit: () => Promise<boolean>;
}

export function useWeekTopic(weekLessons: LessonDto[]): UseWeekTopicResult {
  const [draft] = useState(() => weekTopicDraft(weekLessons));
  const [topic, setTopic] = useState(draft.topic);
  const [selectedIds, setSelectedIds] = useState(draft.selectedIds);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<FormError | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(): Promise<boolean> {
    setServerError(null);
    if (selectedIds.length === 0) {
      setSelectionError(NO_LESSONS_SELECTED_ERROR);
      return false;
    }
    setSelectionError(null);
    setPending(true);
    try {
      // Ответ — занятия после записи; список на «Занятиях» перечитывается
      // при монтировании, второй запрос здесь не нужен.
      await apiRoute('POST /lessons/topic', {
        body: { topic: topic.trim(), lessonIds: selectedIds },
      });
      return true;
    } catch (err) {
      setServerError(errorFrom(err, SAVE_ERROR_MESSAGE));
      return false;
    } finally {
      setPending(false);
    }
  }

  return {
    topic,
    setTopic,
    selectedIds,
    setSelectedIds: (ids) => {
      setSelectedIds(ids);
      setSelectionError(null);
    },
    selectionError,
    serverError,
    pending,
    submit,
  };
}
