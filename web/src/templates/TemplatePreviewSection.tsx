// Нижняя половина редактора шаблона: на каком занятии показать пост, сам
// предпросмотр и почему он сейчас недоступен. Вынесено из TemplateEditor.tsx
// (CLAUDE.md «Храповики»: компонент React больше 150 строк дробится) — здесь
// всё про «посмотреть», выше — всё про «написать».
//
// Предпросмотр рендерит сохранённый на сервере шаблон, не текст в поле: пока
// правки не сохранены, кнопка недоступна и об этом сказано строкой, а не
// молчанием (docs/PLAN.md §6 «Шаблоны»).
import type { LessonDto, TemplateKind } from '@xuanxue/shared';
import { Field } from '../components/Field';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { PostPreview } from '../components/PostPreview';
import { dangerNoteStyle, noteStyle } from '../components/screenLayout';
import { Select } from '../components/Select';
import { TextLinkButton } from '../components/TextLinkButton';
import { formatDateTime } from '../lib/formatDate';
import { useAutoPreview } from './useAutoPreview';

const DIRTY_NOTE =
  'Сначала сохраните — предпросмотр показывает сохранённый текст, не то, что напечатано выше.';
const STAND_IN_NOTE = 'Записи у занятия ещё нет — показали, как будет выглядеть пост.';

interface TemplatePreviewSectionProps {
  kind: TemplateKind;
  savedText: string;
  /** В поле есть несохранённые правки. */
  dirty: boolean;
  lessons: LessonDto[];
  lessonsError: string | null;
  onRetryLessons: () => void;
  /** Пояс школы рядом со временем занятия, если он отличается от браузерного
   * (schedule/timezoneLabel.ts, pr-k3-fixes.md п.22). */
  badge: string | null;
}

export function TemplatePreviewSection({
  kind,
  savedText,
  dirty,
  lessons,
  lessonsError,
  onRetryLessons,
  badge,
}: TemplatePreviewSectionProps) {
  const { lessonId, setLessonId, preview } = useAutoPreview(
    kind,
    lessons,
    savedText,
    dirty,
  );

  return (
    <>
      {lessonsError ? (
        <LoadErrorBanner message={lessonsError} onRetry={onRetryLessons} />
      ) : (
        <Field label="Предпросмотр на занятии">
          <Select value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
            <option value="">Выберите занятие</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {formatDateTime(lesson.startsAt)}
                {badge && ` · ${badge}`} · {lesson.topic || 'Тема не задана'}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {dirty && <p style={noteStyle}>{DIRTY_NOTE}</p>}

      <TextLinkButton
        disabled={!lessonId || dirty || !!lessonsError || preview.pending}
        onClick={() => void preview.preview(kind, lessonId)}
      >
        Обновить предпросмотр
      </TextLinkButton>

      {preview.error && (
        <p role="alert" style={dangerNoteStyle}>
          {preview.error}
        </p>
      )}
      {preview.result && (
        <>
          <PostPreview text={preview.result.text} />
          {preview.result.recordingIsStandIn && <p style={noteStyle}>{STAND_IN_NOTE}</p>}
        </>
      )}
    </>
  );
}
