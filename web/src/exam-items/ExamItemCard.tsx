// Строка вопроса в списке — формулировка (обрезанная CSS-клампом, если
// длинная), под ней тип, статус и номер версии, если он больше 1.
// Список вопросов теперь одна карточка (обёртка — ExamItemsScreen.tsx):
// пять карточек вплотную давали зазубренные углы и швы между ними (отзыв
// владельца по снимку «Вопросов», docs/adr/0043) — строка больше не несёт
// свой фон, радиус и тень, только паддинг и волосяную линию снизу
// (components/SelectableListRow.tsx, тот же приём, что у ExamCard.tsx); у
// последней строки (`isLast`) линии нет. Статистика (ТЗ 4.8) живёт на
// странице вопроса разделом «Как отвечают», не кнопкой внутри строки: числа
// не нужны при каждом взгляде на список, а вторая кнопка в строке ломала бы
// её как список (ADR-0033, макет Main.dc.html).
// `selection` — режим массового удаления (ADR-0141): строка отмечается, а не
// открывает вопрос; ряд рисует общая механика SelectableListRow.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import {
  SelectableListRow,
  type SelectableListRowSelection,
} from '../components/SelectableListRow';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { EXAM_ITEM_KIND_LABELS_RU, EXAM_ITEM_STATUS_LABELS_RU } from './examItemLabels';

const PROMPT_MAX_LINES = 2;

const promptStyle: CSSProperties = {
  ...listCardTitleStyle,
  display: '-webkit-box',
  WebkitLineClamp: PROMPT_MAX_LINES,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

interface ExamItemCardProps {
  item: ExamItemDto;
  onSelect: () => void;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (ExamItemsScreen.tsx, docs/adr/0043). */
  isLast?: boolean;
  /** Задан — строка в режиме массового выбора (ADR-0141, BulkDeleteBar.tsx). */
  selection?: SelectableListRowSelection;
}

export function ExamItemCard({
  item,
  onSelect,
  isLast = false,
  selection,
}: ExamItemCardProps) {
  return (
    <SelectableListRow onOpen={onSelect} isLast={isLast} selection={selection}>
      <div style={promptStyle}>{item.prompt}</div>
      <div style={listCardMetaStyle}>
        {EXAM_ITEM_KIND_LABELS_RU[item.kind]} · {EXAM_ITEM_STATUS_LABELS_RU[item.status]}
        {item.version > 1 && ` · версия ${item.version}`}
        {item.askReason && ' · просит объяснение'}
      </div>
    </SelectableListRow>
  );
}
