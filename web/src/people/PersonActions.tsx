// Действия строки «Люди» — подтверждение первого входа и удаление данных.
// Вынесены из PersonRow.tsx (check-file-size-ratchet: строка обзавелась
// подписью статуса и группой ролей, файл упёрся в свой потолок).
//
// Облик — ADR-0031: «Подтвердить» киноварью и только у тех, кто ждёт
// (единственный акцент на «Людях»), «Удалить данные» — текстом цвета
// опасности без заливки и рамки, как удаление в components/EditorFooter.tsx.
// У своей строки нет ни того ни другого: свой аккаунт не подтверждают и не
// удаляют из интерфейса (SELF_DELETE_MESSAGE, user-deletion.service.ts).
import type { CSSProperties } from 'react';
import { Button } from '../components/Button';

const APPROVE_LABEL = 'Подтвердить';
const REMOVE_LABEL = 'Удалить данные';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 24,
  flexWrap: 'wrap',
};
const removeStyle: CSSProperties = { padding: 0 };

interface PersonActionsProps {
  isSelf: boolean;
  /** Первый вход ещё не подтверждён (ADR-0026) — только тогда «Подтвердить». */
  isInvited: boolean;
  pending: boolean;
  onApprove: () => void;
  onRemove: () => void;
}

export function PersonActions({
  isSelf,
  isInvited,
  pending,
  onApprove,
  onRemove,
}: PersonActionsProps) {
  if (isSelf) return null;
  return (
    <div style={rowStyle}>
      {isInvited && (
        <Button type="button" disabled={pending} onClick={onApprove}>
          {APPROVE_LABEL}
        </Button>
      )}
      <Button
        type="button"
        variant="danger"
        style={removeStyle}
        disabled={pending}
        onClick={onRemove}
      >
        {REMOVE_LABEL}
      </Button>
    </div>
  );
}
