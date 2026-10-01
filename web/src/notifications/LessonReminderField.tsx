// Поле «За сколько напомнить» под переключателем «Занятие скоро» (ADR-0162,
// п. 3): человек выбирает своё время напоминания из четырёх или оставляет
// школьное. Стоит в «Что присылать» (NotificationPrefsSection.tsx, слот
// `settingsForKind`) и рисуется, пока вид включён. Данные приходят из
// useLessonScope.ts, который экран зовёт один раз для всех блоков про занятия;
// запись и ошибка — useLessonReminder.ts, варианты и подсказка —
// lessonReminderOptions.ts, здесь только рендер. Кегль select держит правило
// index.css (ADR-0109).
import type { CSSProperties } from 'react';
import { Field } from '../components/Field';
import { Select } from '../components/Select';
import { SkeletonList } from '../components/Skeleton';
import {
  lessonReminderHint,
  lessonReminderOptions,
  selectedReminderValue,
} from './lessonReminderOptions';
import { useLessonReminder } from './useLessonReminder';
import type { UseLessonScopeResult } from './useLessonScope';

const LABEL = 'За сколько напомнить';
// Высота подписи, поля и подсказки вместе — скелетон держит место, чтобы
// список видов не прыгал, когда придёт ответ.
const SKELETON_HEIGHT_PX = 84;

// Узкий select: «Как в школе — за 45 минут» — самая длинная подпись, во всю
// ширину колонки пустое поле читалось бы как поле для текста.
const selectWidthStyle: CSSProperties = { maxWidth: 320 };

export function LessonReminderField({ lessons }: { lessons: UseLessonScopeResult }) {
  const { reminder, loading, applyReminder } = lessons;
  const { pending, error, choose } = useLessonReminder(applyReminder);

  if (loading) return <SkeletonList rows={1} h={SKELETON_HEIGHT_PX} />;
  // Данных нет и не грузятся — загрузка сорвалась. Её показывает блок «О каких
  // занятиях» с кнопкой повтора: второй баннер про то же самое под
  // переключателем только дублировал бы его.
  if (!reminder) return null;

  return (
    <Field label={LABEL} hint={lessonReminderHint(reminder)} error={error ?? undefined}>
      <Select
        style={selectWidthStyle}
        value={selectedReminderValue(reminder)}
        disabled={pending}
        onChange={(event) => void choose(event.target.value)}
      >
        {lessonReminderOptions(reminder).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
