// Кнопки перехода статуса + необязательная кнопка «Удалить» — одна механика
// на статусные сущности кабинета (вопрос экзамена, форма экзамена; оба —
// draft/published/archived, ТЗ 4.2 и 4.3): раньше набор «кнопки переходов +
// удаление только у черновика + заметка, почему удаления нет» жил только в
// exam-items/ExamItemStatusControls.tsx — второй экран скопировал бы его
// целиком (CLAUDE.md «Одна механика — один компонент», jscpd). Домен решает
// сам, для какого статуса удаление доступно (`onRemove`), какие переходы
// возможны (`actions`) и что написать вместо кнопки (`explanation`) — здесь
// только форма.
import type { CSSProperties } from 'react';
import { Button } from './Button';

export interface StatusAction<TStatus extends string> {
  label: string;
  nextStatus: TStatus;
}

const wrapperStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const rowStyle: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' };
const noteStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

interface StatusActionButtonsProps<TStatus extends string> {
  statusLabel: string;
  pending: boolean;
  actions: StatusAction<TStatus>[];
  onChangeStatus: (status: TStatus) => void;
  /** Кнопка «Удалить» рендерится только когда передан `onRemove` — какому
   * статусу она положена, решает вызывающий компонент. */
  onRemove?: () => void;
  /** Показывается вместо кнопки «Удалить», когда её нет. */
  explanation?: string;
}

export function StatusActionButtons<TStatus extends string>({
  statusLabel,
  pending,
  actions,
  onChangeStatus,
  onRemove,
  explanation,
}: StatusActionButtonsProps<TStatus>) {
  return (
    <div style={wrapperStyle}>
      <p style={noteStyle}>Статус: {statusLabel}</p>
      <div style={rowStyle}>
        {actions.map((action) => (
          <Button
            key={action.nextStatus}
            type="button"
            variant="secondary"
            pending={pending}
            onClick={() => onChangeStatus(action.nextStatus)}
          >
            {action.label}
          </Button>
        ))}
        {onRemove && (
          <Button type="button" variant="danger" pending={pending} onClick={onRemove}>
            Удалить
          </Button>
        )}
      </div>
      {!onRemove && explanation && <p style={noteStyle}>{explanation}</p>}
    </div>
  );
}
