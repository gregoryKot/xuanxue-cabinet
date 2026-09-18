// Действия строки рассылки — «Раскрыть/Свернуть» и «Отменить» с диалогом
// подтверждения; вынесено из BroadcastCard.tsx, чтобы строка не пересекла
// порог 150 строк (CLAUDE.md «Храповики»: «Компонент React больше 150 —
// выноси хуки и подкомпоненты»). Своего теста нет — путь целиком уже проверен
// через BroadcastCard.test.tsx (тот же приём, что у SummaryNumbers.tsx).
//
// «Раскрыть/Свернуть» — терракотой (`accent`: макет красит акцентом именно
// это действие, ADR-0043), «Отменить» — отдельным --danger, два разных
// смысла разными цветами. Отмена через ConfirmDialog: у рассылки нет пути
// назад после отправки.
import { useState, type CSSProperties } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { errorFrom } from '../components/FormServerError';
import { dangerNoteStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';

const CANCEL_ERROR = 'Не удалось отменить рассылку. Попробуйте ещё раз.';
const CANCEL_MESSAGE =
  'Рассылка не уйдёт ни в один канал. Вернуть её потом не получится.';

const actionsStyle: CSSProperties = { display: 'flex', gap: 20, flexWrap: 'wrap' };

interface BroadcastCardActionsProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  /** `id` блока доставок под строкой — связывает кнопку с `aria-controls`. */
  deliveriesId: string;
  canCancel: boolean;
  onCancel: () => Promise<void>;
}

export function BroadcastCardActions({
  expanded,
  onToggleExpanded,
  deliveriesId,
  canCancel,
  onCancel,
}: BroadcastCardActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onCancel();
    } catch (err) {
      setError(errorFrom(err, CANCEL_ERROR).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {error && (
        <p role="alert" style={dangerNoteStyle}>
          {error}
        </p>
      )}
      <div style={actionsStyle}>
        <TextLinkButton
          accent
          aria-expanded={expanded}
          aria-controls={deliveriesId}
          onClick={onToggleExpanded}
        >
          {expanded ? 'Свернуть' : 'Раскрыть'}
        </TextLinkButton>
        {canCancel && (
          <TextLinkButton danger onClick={() => setConfirming(true)}>
            Отменить
          </TextLinkButton>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title="Отменить рассылку?"
          message={CANCEL_MESSAGE}
          confirmLabel="Отменить рассылку"
          pending={pending}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
