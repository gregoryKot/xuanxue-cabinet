// Строка экзамена в общей карточке списка — название антиквой, мета под
// ним, статус справа (ТЗ 4.3 «Список», макет 2b-exams.html, docs/adr/0043).
// Список экзаменов теперь одна карточка (обёртка — ExamsScreen.tsx), поэтому
// строка не несёт свой фон, радиус и тень: только паддинг и волосяная линия
// снизу (components/SelectableListRow.tsx); у последней строки линии нет —
// тот же приём, что у журнала рассылок (broadcasts/BroadcastCard.tsx) и всех
// остальных списков кабинета: exam-items/ExamItemCard.tsx,
// channels/ChannelCard.tsx, grading/GradingQueueCard.tsx.
// components/listCardStyles.ts (listCardStyle) сюда больше не подходит — своя
// карточка на строку осталась только у schedule/SlotCard.tsx, где строка
// стоит в сетке недели, а не в общем списке, и собственный `gap` колонки дня
// швов не даёт.
// `selection` — режим массового удаления (ADR-0141): строка отмечается, а не
// открывает экзамен; ряд рисует общая механика SelectableListRow.
import type { CSSProperties } from 'react';
import type { ExamDto } from '@xuanxue/shared';
import {
  SelectableListRow,
  type SelectableListRowSelection,
} from '../components/SelectableListRow';
import {
  DRAFT_PUBLISHED_ARCHIVED_LABELS_RU,
  DRAFT_PUBLISHED_ARCHIVED_STATUS_COLOR,
} from '../lib/statusTransitions';
import { formatExamListMeta } from './examCounts';

const rowContentStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
};
const infoStyle: CSSProperties = { minWidth: 0, flex: 1 };
const titleStyle: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 23 };
const metaStyle: CSSProperties = { marginTop: 4, fontSize: 14, color: 'var(--ink-soft)' };
const statusStyle: CSSProperties = { flexShrink: 0, fontSize: 13 };

interface ExamCardProps {
  exam: ExamDto;
  onSelect: () => void;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (ExamsScreen.tsx, docs/adr/0043): иначе под линией остаётся голая
   * полоска фона (тот же приём, что у BroadcastCard.tsx). */
  isLast?: boolean;
  /** Задан — строка в режиме массового выбора (ADR-0141, BulkDeleteBar.tsx). */
  selection?: SelectableListRowSelection;
}

export function ExamCard({ exam, onSelect, isLast = false, selection }: ExamCardProps) {
  return (
    <SelectableListRow onOpen={onSelect} isLast={isLast} selection={selection}>
      <div style={rowContentStyle}>
        <div style={infoStyle}>
          <div style={titleStyle}>{exam.title}</div>
          <div style={metaStyle}>{formatExamListMeta(exam)}</div>
        </div>
        <span
          style={{
            ...statusStyle,
            color: DRAFT_PUBLISHED_ARCHIVED_STATUS_COLOR[exam.status],
          }}
        >
          {DRAFT_PUBLISHED_ARCHIVED_LABELS_RU[exam.status]}
        </span>
      </div>
    </SelectableListRow>
  );
}
