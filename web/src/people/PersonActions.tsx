// Действия строки «Люди» — блокировка/открытие доступа, выгрузка и удаление
// данных. Вынесены из PersonRow.tsx (check-file-size-ratchet: строка обзавелась
// подписью статуса и группой ролей, файл упёрся в свой потолок).
//
// Облик — ADR-0031: «Удалить данные» — текстом цвета опасности без заливки и
// рамки, как удаление в components/EditorFooter.tsx. Доступ — вторичная
// кнопка (контур без заливки): заливка терракотой зарезервирована за главным
// действием экрана (Button.tsx), а блокировка обратима — не тот вес, что у
// необратимого удаления, поэтому и без ConfirmDialog (ADR-0036, RUNBOOK
// §8.15). «Выгрузить данные» — тоже вторичная кнопка: ничего не меняет и не
// удаляет, а объясняет себя диалогом до скачивания (PersonExportButton.tsx,
// ADR-0160). У своей строки действий нет: свой аккаунт не удаляют и свой
// доступ не закрывают из интерфейса (SELF_DELETE_MESSAGE, SELF_BLOCK_MESSAGE).
import type { CSSProperties } from 'react';
import type { UserDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { PersonExportButton } from './PersonExportButton';

const REMOVE_LABEL = 'Удалить данные';
const CLOSE_ACCESS_LABEL = 'Закрыть доступ';
const OPEN_ACCESS_LABEL = 'Открыть доступ';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 24,
  flexWrap: 'wrap',
};
const removeStyle: CSSProperties = { padding: 0 };

interface PersonActionsProps {
  personId: string;
  isSelf: boolean;
  pending: boolean;
  status: UserDto['status'];
  onToggleAccess: () => void;
  onRemove: () => void;
}

export function PersonActions({
  personId,
  isSelf,
  pending,
  status,
  onToggleAccess,
  onRemove,
}: PersonActionsProps) {
  if (isSelf) return null;
  const accessLabel = status === 'blocked' ? OPEN_ACCESS_LABEL : CLOSE_ACCESS_LABEL;
  return (
    <div style={rowStyle}>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={onToggleAccess}
      >
        {accessLabel}
      </Button>
      <PersonExportButton personId={personId} />
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
