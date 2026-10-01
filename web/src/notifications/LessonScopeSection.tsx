// Блок «О каких занятиях» на экране настроек уведомлений (ADR-0162): человек
// выбирает, о каких занятиях расписания приходит «Занятие скоро» — обо всех
// (как всегда) или только о тех, на которые ходит. Показывается тому, у кого
// есть хоть один вид уведомления про занятие (`hasLessonScopedKinds`): сегодня
// это ученик, штат получает обо всех занятиях (решение владельца 2026-09-30).
// Каждое изменение — сразу PUT с выбором целиком и отрисовка из его ответа, без
// второго GET (ADR-0087). Оптимистичной отрисовки нет: пока PUT в пути,
// контролы выключены, а положение не меняется до ответа, тем же приёмом, что у
// NotificationPrefsSection.tsx.
import type { CSSProperties } from 'react';
import {
  LESSON_SCOPE_MODES,
  defaultNotifications,
  hasLessonScopedKinds,
  type LessonScopeMode,
} from '@xuanxue/shared';
import { useAuth } from '../auth/AuthProvider';
import { LoadableSection } from '../components/LoadableSection';
import { dangerNoteStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { Toggle } from '../components/Toggle';
import { LessonScopeClassList } from './LessonScopeClassList';
import { scopeWithMode } from './lessonScopeEdit';
import { useLessonScope } from './useLessonScope';

const HEADING = 'О каких занятиях';
const EXPLANATION =
  'Отметьте занятия, на которые ходите, — напоминания будут приходить **только о них**.';
const RADIO_LEGEND = 'О каких занятиях напоминать';
const RADIO_GROUP_NAME = 'lesson-scope-mode';
const MODE_LABELS: Record<LessonScopeMode, string> = {
  all: 'Обо всех занятиях школы',
  selected: 'Только о выбранных',
};

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

function LessonScopeBlock() {
  const { scope, classes, loading, error, reload, saving, saveError, save } =
    useLessonScope();

  return (
    <LoadableSection
      heading={HEADING}
      explanation={EXPLANATION}
      error={error}
      onRetry={() => void reload()}
    >
      {/* Скелетон по форме будущего: два переключателя режима и первые строки
          списка (CLAUDE.md «Загрузка»). */}
      {loading && !error && <SkeletonList rows={4} h={48} />}

      {scope && !loading && !error && (
        <>
          <fieldset style={fieldsetStyle}>
            <legend className="xuanxue-sr-only">{RADIO_LEGEND}</legend>
            {LESSON_SCOPE_MODES.map((mode) => (
              <Toggle
                key={mode}
                name={RADIO_GROUP_NAME}
                label={MODE_LABELS[mode]}
                checked={scope.mode === mode}
                disabled={saving}
                onChange={() => void save(scopeWithMode(scope, classes, mode))}
              />
            ))}
          </fieldset>
          {scope.mode === 'selected' && (
            <LessonScopeClassList
              scope={scope}
              classes={classes}
              disabled={saving}
              onChange={(next) => void save(next)}
            />
          )}
        </>
      )}

      {saveError && (
        <p role="alert" style={dangerNoteStyle}>
          {saveError}
        </p>
      )}
    </LoadableSection>
  );
}

export function LessonScopeSection() {
  const { me } = useAuth();
  // Пока `me` не пришёл, не знаем, нужен ли блок: скелетон, не пустота и не
  // лишний запрос за занятиями человеку, которому блока не положено.
  if (me === null) return <SkeletonList rows={3} h={48} />;
  if (!hasLessonScopedKinds(defaultNotifications(me.roles))) return null;
  return <LessonScopeBlock />;
}
