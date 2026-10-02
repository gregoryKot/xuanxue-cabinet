// Список занятий галочками для режима «Только о выбранных» (ADR-0162). Строка —
// нативный чекбокс из Toggle.tsx с подписью «название · подпись группы» и днями
// со временем второй строкой. Показаны правила расписания, а не даты, поэтому
// время школьное, как в сетке «Расписания» штата (classSlotsLabel.ts), а пояс
// школы, если он другой, назван один раз над списком (`ruleTzNote`), не у
// каждой строки: частокол «Asia/Jerusalem» читался шумом (отзыв владельца
// 2026-09-12, schedule/timezoneLabel.ts). Состояние и запись — у
// LessonScopeSection.tsx, здесь только рендер и тело будущего PUT.
import type { CSSProperties } from 'react';
import {
  classDisplayName,
  type LessonScope,
  type LessonScopeClassDto,
} from '@xuanxue/shared';
import { oneCardListStyle } from '../components/listCardStyles';
import { RichText } from '../components/RichText';
import { noteStyle } from '../components/screenLayout';
import { Toggle } from '../components/Toggle';
import { classSlotsLabel } from '../lib/classSlotsLabel';
import { ruleTzNote } from '../schedule/timezoneLabel';
import { hasNoTicks, scopeWithTick, tickedClassIds } from './lessonScopeEdit';

const EMPTY_CLASSES_MESSAGE = 'В расписании пока нет занятий.';
const NOTHING_TICKED_MESSAGE = 'Ничего не отмечено — уведомлений о занятиях не будет.';

const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

// Общую карточку красит список (oneCardListStyle, ADR-0043), строка несёт
// отступ и волосяную линию снизу; у последней строки линии нет.
function rowStyle(isLast: boolean): CSSProperties {
  return {
    padding: '6px 18px',
    borderBottom: isLast ? 'none' : '1px solid var(--panel)',
  };
}

interface LessonScopeClassListProps {
  scope: LessonScope;
  classes: LessonScopeClassDto[];
  /** Идёт запись — строки на это время выключены. */
  disabled: boolean;
  onChange: (next: LessonScope) => void;
}

export function LessonScopeClassList({
  scope,
  classes,
  disabled,
  onChange,
}: LessonScopeClassListProps) {
  if (classes.length === 0) return <p style={noteStyle}>{EMPTY_CLASSES_MESSAGE}</p>;

  const ticked = new Set(tickedClassIds(scope, classes));
  const tzNote = ruleTzNote(classes.map((item) => item.tz));

  return (
    <div style={columnStyle}>
      {tzNote && (
        <p style={noteStyle}>
          <RichText text={tzNote} />
        </p>
      )}
      <ul style={oneCardListStyle}>
        {classes.map((item, index) => (
          <li key={item.id} style={rowStyle(index === classes.length - 1)}>
            <Toggle
              label={classDisplayName(item)}
              hint={classSlotsLabel(item.slots)}
              checked={ticked.has(item.id)}
              disabled={disabled}
              onChange={(isTicked) =>
                onChange(scopeWithTick(scope, classes, item.id, isTicked))
              }
            />
          </li>
        ))}
      </ul>
      {/* role="status": строка появляется, когда человек снял последнюю
          галочку, — скринридер должен её произнести, а не молчать. */}
      {hasNoTicks(scope, classes) && (
        <p role="status" style={noteStyle}>
          {NOTHING_TICKED_MESSAGE}
        </p>
      )}
    </div>
  );
}
