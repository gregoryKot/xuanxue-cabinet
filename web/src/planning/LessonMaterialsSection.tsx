// Секция «Материалы» на странице даты занятия (ADR-0056) — рядом с «Записью»:
// после занятия учитель открывает эту страницу, и ссылка, которую он обещал
// группе, у него в руках именно здесь. «Добавить ссылку» заводит материал и
// привязывает его к этой дате, «Из библиотеки» привязывает уже заведённый,
// «Убрать» снимает привязку и оставляет материал в библиотеке — удаления
// материала здесь нет, оно живёт на его странице.
//
// Хранилище одно (ADR-0056): библиотека — витрина той же коллекции, поэтому
// «прикрепил к занятию — появилось в материалах» происходит само.
import { useState, type CSSProperties } from 'react';
import { Button } from '../components/Button';
import { editorSectionStyle } from '../components/editorLayout';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { dangerNoteStyle, noteStyle } from '../components/screenLayout';
import { LessonMaterialPicker } from './LessonMaterialPicker';
import { LessonMaterialRow } from './LessonMaterialRow';
import { NewLessonMaterialForm } from './NewLessonMaterialForm';
import { useLessonMaterials } from './useLessonMaterials';

const TITLE = 'Материалы';
const EXPLANATION =
  'Ссылки этого занятия: конспект, видео, статья. Они же встают в «Материалы» — заводить их там второй раз не нужно.';
const EMPTY_TEXT =
  'Пока ни одной. Добавьте — ученик увидит её в архиве занятия, рядом с записью.';
const LOADING_TEXT = 'Загружаем материалы занятия…';
const NEW_LABEL = 'Добавить ссылку';
const LIBRARY_LABEL = 'Из библиотеки';
const REMOVE_LABEL = 'Убрать';

/** Что раскрыто под списком. Одновременно — только одно: два ввода подряд на
 * узком экране перестают читаться (CLAUDE.md «Мобильный экран первым»). */
type PickerMode = 'closed' | 'new' | 'library';

// Волосяную линию сверху секция несёт сама: на странице занятия она стоит
// второй в одном разделе с «Записью» (LessonEditorForm.tsx), и разделитель
// между ними нужен такой же, как у других разделов страницы-редактора.
const sectionStyle: CSSProperties = {
  ...editorSectionStyle,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};
const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };
const actionsStyle: CSSProperties = { display: 'flex', gap: 16, flexWrap: 'wrap' };

interface LessonMaterialsSectionProps {
  lessonId: string;
}

export function LessonMaterialsSection({ lessonId }: LessonMaterialsSectionProps) {
  const state = useLessonMaterials(lessonId);
  const [mode, setMode] = useState<PickerMode>('closed');
  const materials = state.materials ?? [];

  function handleCreated() {
    setMode('closed');
    void state.reload();
  }

  return (
    <section style={sectionStyle}>
      <h3 style={{ margin: 0, fontSize: 15 }}>{TITLE}</h3>
      <p style={noteStyle}>{EXPLANATION}</p>

      {state.error && (
        <LoadErrorBanner message={state.error} onRetry={() => void state.reload()} />
      )}

      {state.loading && <p style={noteStyle}>{LOADING_TEXT}</p>}

      {!state.loading && !state.error && materials.length === 0 && (
        <p style={noteStyle}>{EMPTY_TEXT}</p>
      )}

      {materials.length > 0 && (
        <ul style={listStyle}>
          {materials.map((material) => (
            <LessonMaterialRow
              key={material.id}
              material={material}
              actionLabel={REMOVE_LABEL}
              onAction={() => void state.detach(material)}
            />
          ))}
        </ul>
      )}

      {state.linkError && (
        <p style={dangerNoteStyle} role="alert">
          {state.linkError}
        </p>
      )}

      {mode === 'new' && (
        <NewLessonMaterialForm
          lessonId={lessonId}
          onCreated={handleCreated}
          onCancel={() => setMode('closed')}
        />
      )}

      {mode === 'library' && (
        <LessonMaterialPicker
          attached={materials}
          onAttach={(material) => void state.attach(material)}
          onClose={() => setMode('closed')}
        />
      )}

      {/* `type="button"` — секция стоит внутри формы занятия
          (LessonEditorForm.tsx), кнопка по умолчанию отправила бы её. */}
      {mode === 'closed' && (
        <div style={actionsStyle}>
          <Button type="button" variant="secondary" onClick={() => setMode('new')}>
            {NEW_LABEL}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode('library')}>
            {LIBRARY_LABEL}
          </Button>
        </div>
      )}
    </section>
  );
}
