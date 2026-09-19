// Один редактор шаблона — textarea, чипы плейсхолдеров и «Сбросить»; выбор
// занятия с предпросмотром — TemplatePreviewSection.tsx рядом
// (docs/PLAN.md §6 «Шаблоны»). Два инстанса на экране
// (анонс/запись) — CLAUDE.md «Одна механика — один компонент»: сама механика
// «текст + плейсхолдеры + предпросмотр» одна, разный только `kind`.
import type { CSSProperties } from 'react';
import { DEFAULT_TEMPLATES, type LessonDto, type TemplateKind } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { dangerNoteStyle } from '../components/screenLayout';
import { editorSectionStyle } from '../components/editorLayout';
import { tzBadge } from '../schedule/timezoneLabel';
import { TextLinkButton } from '../components/TextLinkButton';
import { PlaceholderChips } from './PlaceholderChips';
import { TEMPLATE_KIND_LABELS_RU } from './templateKindLabels';
import { TemplatePreviewSection } from './TemplatePreviewSection';
import { useInsertAtCursor } from './useInsertAtCursor';
import { validateTemplateText } from './templateValidation';

// Раздел шаблона отбит волосяной линией сверху, как разделы страницы-
// редактора (components/screenLayout.ts): два шаблона подряд читаются как
// части одной страницы, а не как две карточки.
const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

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
  const dirty = text !== savedText;
  const validationError = validateTemplateText(text);
  const badge = schoolTz ? tzBadge(schoolTz) : null;
  const { textareaRef, insertAtCursor } = useInsertAtCursor(text, onChange);

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={{ margin: 0 }}>
        {TEMPLATE_KIND_LABELS_RU[kind]}
      </h2>

      <Field label="Текст шаблона" error={validationError ?? undefined}>
        <textarea
          ref={textareaRef}
          style={{ ...inputStyle, minHeight: 140 }}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
      {serverError && (
        <p role="alert" style={dangerNoteStyle}>
          {serverError}
        </p>
      )}
      <PlaceholderChips onInsert={insertAtCursor} />
      <TextLinkButton onClick={() => onChange(DEFAULT_TEMPLATES[kind])}>
        Сбросить к тексту по умолчанию
      </TextLinkButton>

      <TemplatePreviewSection
        kind={kind}
        savedText={savedText}
        dirty={dirty}
        lessons={lessons}
        lessonsError={lessonsError}
        onRetryLessons={onRetryLessons}
        badge={badge}
      />
    </section>
  );
}
