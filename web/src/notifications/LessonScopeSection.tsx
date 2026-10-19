// Блок «О каких занятиях» на экране настроек уведомлений (ADR-0185): человек
// отмечает занятия расписания, о которых приходит напоминание «Занятие скоро».
// Отмены занятий этот выбор не трогает. Показывается тому, у кого есть хоть один
// вид уведомления про занятие (`hasLessonScopedKinds`): сегодня это ученик,
// штат получает обо всех занятиях (решение владельца 2026-09-30).
// Каждая галочка — сразу `PATCH` с одним изменением, отрисовка из его ответа,
// без второго GET (ADR-0087). Оптимистичной отрисовки нет: пока запись в пути,
// контролы выключены, а положение не меняется до ответа. Снимок блок не грузит
// сам: экран зовёт useReminderSync один раз и отдаёт результат и ему, и полю
// «За сколько напомнить» (LessonReminderField.tsx).
import { useAuth } from '../auth/AuthProvider';
import { LoadableSection } from '../components/LoadableSection';
import { SkeletonList } from '../components/Skeleton';
import { LessonScopeClassList } from './LessonScopeClassList';
import { ReminderSyncNotice } from './ReminderSyncNotice';
import { hasLessonSettings } from './useLessonScope';
import type { UseReminderSyncResult } from './useReminderSync';

const HEADING = 'О каких занятиях';
const EXPLANATION =
  'Отметьте занятия, на которые ходите, — напоминание «Занятие скоро» придёт **только о них**. На отмены занятий отметки не влияют.';

function LessonScopeBlock({ sync }: { sync: UseReminderSyncResult }) {
  const { snapshot, loading, loadError, controlsDisabled, save, retryRead } = sync;

  return (
    <LoadableSection
      heading={HEADING}
      explanation={EXPLANATION}
      error={loadError}
      onRetry={retryRead}
    >
      {/* Скелетон по форме будущего: первые строки списка (CLAUDE.md «Загрузка»). */}
      {loading && <SkeletonList rows={4} h={48} />}

      {snapshot && (
        <LessonScopeClassList
          snapshot={snapshot}
          disabled={controlsDisabled}
          onChange={(id, selected) => save({ kind: 'class', id, selected })}
        />
      )}

      <ReminderSyncNotice sync={sync} control="class" />
    </LoadableSection>
  );
}

export function LessonScopeSection({ sync }: { sync: UseReminderSyncResult }) {
  const { me } = useAuth();
  // Пока `me` не пришёл, не знаем, нужен ли блок: скелетон, не пустота. Запрос
  // снимка хук шлёт только тому, кому блок положен (`hasLessonSettings`).
  if (me === null) return <SkeletonList rows={3} h={48} />;
  if (!hasLessonSettings(me)) return null;
  return <LessonScopeBlock sync={sync} />;
}
