// Предпросмотр без трёх ручных шагов (отзыв владельца 2026-09-08): ближайшее
// занятие выбирается само, предпросмотр запускается сам при первой загрузке и
// после каждого успешного сохранения — учителю не нужно выбирать занятие в
// пустом select и жать кнопку, чтобы просто увидеть результат. Кнопка
// «Обновить предпросмотр» в TemplateEditor.tsx остаётся для ручного повтора и
// вызывает preview.preview() напрямую, в обход защиты от повтора ниже — там
// это осознанное действие учителя, не автозапуск.
import { useEffect, useRef, useState } from 'react';
import type { LessonDto, TemplateKind } from '@xuanxue/shared';
import { usePreview, type UsePreviewResult } from './usePreview';

export interface UseAutoPreviewResult {
  lessonId: string;
  setLessonId: (id: string) => void;
  preview: UsePreviewResult;
}

export function useAutoPreview(
  kind: TemplateKind,
  lessons: LessonDto[],
  savedText: string,
  dirty: boolean,
): UseAutoPreviewResult {
  const [lessonId, setLessonIdState] = useState('');
  // Учитель тронул select сам — автовыбор больше не подменяет его выбор.
  const touched = useRef(false);
  // Ключ последнего автозапроса (kind+занятие+сохранённый текст) — без него
  // `preview` в зависимостях эффекта (usePreview возвращает новый объект на
  // каждый рендер, exhaustive-deps требует его целиком, не только .preview)
  // гонял бы запрос на каждый ре-рендер, а не только когда что-то реально
  // изменилось.
  const lastAutoKey = useRef<string | null>(null);
  const preview = usePreview();

  function setLessonId(id: string): void {
    touched.current = true;
    setLessonIdState(id);
  }

  // useNextLessons.ts отдаёт занятия уже отсортированными по startsAt —
  // первое в списке и есть ближайшее.
  useEffect(() => {
    if (touched.current || lessonId) return;
    const nearest = lessons[0];
    if (nearest) setLessonIdState(nearest.id);
  }, [lessons, lessonId]);

  useEffect(() => {
    if (!lessonId || dirty) return;
    const key = `${kind}:${lessonId}:${savedText}`;
    if (lastAutoKey.current === key) return;
    lastAutoKey.current = key;
    void preview.preview(kind, lessonId);
  }, [kind, lessonId, savedText, dirty, preview]);

  return { lessonId, setLessonId, preview };
}
