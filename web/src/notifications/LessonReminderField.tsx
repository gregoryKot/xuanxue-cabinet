// Поле «За сколько напомнить» под переключателем «Занятие скоро» (ADR-0185):
// человек выбирает своё время напоминания (в момент начала, за 15 минут, за
// 2 часа и так далее) либо оставляет школьное. Стоит в «Что присылать»
// (NotificationPrefsSection.tsx, слот `settingsForKind`) и рисуется, пока вид
// включён. Снимок приходит из useReminderSync.ts, который экран зовёт один раз
// для всех блоков про занятия; варианты и подсказка — lessonReminderOptions.ts,
// здесь только рендер. Кегль select держит правило index.css (ADR-0109).
import type { CSSProperties } from 'react';
import { Field } from '../components/Field';
import { Select } from '../components/Select';
import { SkeletonList } from '../components/Skeleton';
import {
  leadChangeFromValue,
  lessonReminderHint,
  lessonReminderOptions,
  selectedReminderValue,
} from './lessonReminderOptions';
import { ReminderSyncNotice } from './ReminderSyncNotice';
import type { UseReminderSyncResult } from './useReminderSync';

const LABEL = 'За сколько напомнить';
// Высота подписи, поля и подсказки вместе — скелетон держит место, чтобы
// список видов не прыгал, когда придёт ответ.
const SKELETON_HEIGHT_PX = 84;

// Узкий select: «Как в школе — за 45 минут» — самая длинная подпись, во всю
// ширину колонки пустое поле читалось бы как поле для текста.
const selectWidthStyle: CSSProperties = { maxWidth: 320 };
const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };

export function LessonReminderField({ sync }: { sync: UseReminderSyncResult }) {
  const { snapshot, loading, controlsDisabled, save } = sync;

  if (loading) return <SkeletonList rows={1} h={SKELETON_HEIGHT_PX} />;
  // Снимка нет и он не грузится — загрузка сорвалась. Её показывает блок «О каких
  // занятиях» с кнопкой повтора: второй баннер про то же самое под
  // переключателем только дублировал бы его.
  if (!snapshot) return null;

  return (
    <div style={columnStyle}>
      <Field label={LABEL} hint={lessonReminderHint(snapshot)}>
        <Select
          style={selectWidthStyle}
          value={selectedReminderValue(snapshot)}
          disabled={controlsDisabled}
          onChange={(event) => {
            const change = leadChangeFromValue(event.target.value);
            if (change) save(change);
          }}
        >
          {lessonReminderOptions(snapshot).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <ReminderSyncNotice sync={sync} control="lead" />
    </div>
  );
}
