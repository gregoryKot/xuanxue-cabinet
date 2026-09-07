// Один редактор шаблона — textarea, чипы плейсхолдеров, «Сбросить», выбор
// занятия и предпросмотр (docs/PLAN.md §6 «Шаблоны»). Два инстанса на экране
// (анонс/запись) — CLAUDE.md «Одна механика — один компонент»: сама механика
// «текст + плейсхолдеры + предпросмотр» одна, разный только `kind`.
import { useState, type CSSProperties } from 'react';
import { DEFAULT_TEMPLATES, type LessonDto, type TemplateKind } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { PostPreview } from '../components/PostPreview';
import { formatDateTime } from '../lib/formatDate';
import { tzBadge } from '../schedule/timezoneLabel';
import { PlaceholderChips } from './PlaceholderChips';
import { TEMPLATE_KIND_LABELS_RU } from './templateKindLabels';
import { usePreview } from './usePreview';
import { validateTemplateText } from './templateValidation';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

interface TemplateEditorProps {
  kind: TemplateKind;
  text: string;
  savedText: string;
  onChange: (text: string) => void;
  lessons: LessonDto[];
  lessonsError: string | null;
  onRetryLessons: () => void;
  /** Ошибка сервера при сохранении, если сервер связал её с этим шаблоном —
   * ключ шаблона в тексте уже заменён на подпись по-русски
   * (templateServerError.ts, pr-k3-fixes.md п.5). */
  serverError?: string;
  /** Пояс школы (`SettingsDto.tz`) — бейдж рядом со временем занятия в
   * выборе для предпросмотра, только если отличается от браузерного
   * (schedule/timezoneLabel.ts, pr-k3-fixes.md п.22). */
  schoolTz?: string;
}

export function TemplateEditor({
  kind,
  text,
  savedText,
  onChange,
  lessons,
  lessonsError,
  onRetryLessons,
  serverError,
  schoolTz,
}: TemplateEditorProps) {
  const [lessonId, setLessonId] = useState('');
  const preview = usePreview();
  const dirty = text !== savedText;
  const validationError = validateTemplateText(text);
  const badge = schoolTz ? tzBadge(schoolTz) : null;

  return (
    <section style={sectionStyle}>
      <h2 style={{ margin: 0, fontSize: 16 }}>{TEMPLATE_KIND_LABELS_RU[kind]}</h2>

      <Field label="Текст шаблона" error={validationError ?? undefined}>
        <textarea
          style={{ ...inputStyle, minHeight: 140 }}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
      {serverError && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>
          {serverError}
        </p>
      )}
      <PlaceholderChips />
      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange(DEFAULT_TEMPLATES[kind])}
      >
        Сбросить к тексту по умолчанию
      </Button>

      {lessonsError ? (
        <LoadErrorBanner message={lessonsError} onRetry={onRetryLessons} />
      ) : (
        <Field label="Предпросмотр на занятии">
          <select
            style={inputStyle}
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
          >
            <option value="">Выберите занятие</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {formatDateTime(lesson.startsAt)}
                {badge && ` · ${badge}`} · {lesson.topic || 'Тема не задана'}
              </option>
            ))}
          </select>
        </Field>
      )}

      {dirty && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
          Сначала сохраните — предпросмотр показывает сохранённый текст, не то, что
          напечатано выше.
        </p>
      )}

      <Button
        type="button"
        variant="secondary"
        disabled={!lessonId || dirty || !!lessonsError}
        pending={preview.pending}
        onClick={() => void preview.preview(kind, lessonId)}
      >
        Показать предпросмотр
      </Button>

      {preview.error && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>
          {preview.error}
        </p>
      )}
      {preview.result && (
        <>
          <PostPreview text={preview.result.text} />
          {preview.result.recordingIsStandIn && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
              Записи у занятия ещё нет — показали, как будет выглядеть пост.
            </p>
          )}
        </>
      )}
    </section>
  );
}
