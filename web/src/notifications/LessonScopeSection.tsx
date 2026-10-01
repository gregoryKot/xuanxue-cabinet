// Блок «О каких занятиях» на экране настроек уведомлений (ADR-0162): человек
// выбирает, о каких занятиях расписания приходят «Занятие скоро» и «Занятие
// отменено» — обо всех (как всегда) или только о тех, на которые ходит. Показывается тому, у кого
// есть хоть один вид уведомления про занятие (`hasLessonScopedKinds`): сегодня
// это ученик, штат получает обо всех занятиях (решение владельца 2026-09-30).
// Каждое изменение — сразу PUT с выбором целиком и отрисовка из его ответа, без
// второго GET (ADR-0087). Оптимистичной отрисовки нет: пока PUT в пути,
// контролы выключены, а положение не меняется до ответа, тем же приёмом, что у
// NotificationPrefsSection.tsx. Данные блок не грузит сам: экран зовёт
// useLessonScope один раз и отдаёт результат и ему, и полю «За сколько
// напомнить» (LessonReminderField.tsx) — один `GET` на экран.
import type { CSSProperties } from 'react';
import { LESSON_SCOPE_MODES, type LessonScopeMode } from '@xuanxue/shared';
import { useAuth } from '../auth/AuthProvider';
import { LoadableSection } from '../components/LoadableSection';
import { dangerNoteStyle } from '../components/screenLayout';
import { SkeletonList } from '../components/Skeleton';
import { Toggle } from '../components/Toggle';
import { LessonScopeClassList } from './LessonScopeClassList';
import { scopeWithMode } from './lessonScopeEdit';
import { hasLessonSettings, type UseLessonScopeResult } from './useLessonScope';

const HEADING = 'О каких занятиях';
const EXPLANATION =
  'Отметьте занятия, на которые ходите, — уведомления о занятиях будут приходить **только о них**.';
const RADIO_LEGEND = 'О каких занятиях уведомлять';
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

function LessonScopeBlock({ lessons }: { lessons: UseLessonScopeResult }) {
  const { scope, classes, loading, error, reload, saving, saveError, save } = lessons;

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

export function LessonScopeSection({ lessons }: { lessons: UseLessonScopeResult }) {
  const { me } = useAuth();
  // Пока `me` не пришёл, не знаем, нужен ли блок: скелетон, не пустота. Запрос
  // за занятиями экран шлёт только тому, кому блок положен (`hasLessonSettings`).
  if (me === null) return <SkeletonList rows={3} h={48} />;
  if (!hasLessonSettings(me)) return null;
  return <LessonScopeBlock lessons={lessons} />;
}
