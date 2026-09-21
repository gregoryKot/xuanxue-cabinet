// Список полученных записей видео-вопроса (AttemptQuestionVideo.tsx) — своя
// запись `kind: 'link'` получает «Заменить» и «Убрать» (ADR-0086), запись из
// бота и ручная отметка учителя остаются строкой без кнопок: снять их отсюда
// нельзя — видео в чате учителя нашей строкой не отзовётся (ADR-0086,
// «Альтернативы»). Отдельный файл, а не блок в AttemptQuestionVideo.tsx: с
// ConfirmDialog, двумя TextLinkButton и своим FormServerError компонент
// вопроса перевалил бы за 150 строк (scripts/check-file-size-ratchet.mjs).
//
// Ссылка на вопрос — одна (уникальный индекс `(attemptId, itemId)`,
// exam-media.ts), поэтому в `received` не больше одной записи `kind: 'link'`
// — один useConfirmedRemove на компонент, не по записи.
//
// «Заменить» зовёт то же removeMedia напрямую, без диалога: убрали → форма
// ссылки на месте записи снова видна, второго шага нет (ADR-0086). «Убрать»
// идёт через ConfirmDialog — в отличие от замены, после него ничего не
// приходит само, и это стоит подтвердить.
import type { ExamMediaDto } from '@xuanxue/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError } from '../components/FormServerError';
import { TextLinkButton } from '../components/TextLinkButton';
import { useConfirmedRemove } from '../hooks/useConfirmedRemove';
import { formatExamMediaReceivedAt } from '../lib/examMedia';
import {
  attemptVideoReceivedActionsStyle,
  attemptVideoReceivedListStyle,
} from './attemptVideoStyles';
import type { AttemptVideoControls } from './useAttemptMedia';

const REPLACE_LABEL = 'Заменить';
const REMOVE_LABEL = 'Убрать';
const REMOVE_CONFIRM_LABEL = 'Убрать ссылку';
const REMOVE_DIALOG_TITLE = 'Убрать ссылку на видео?';
const REMOVE_DIALOG_MESSAGE =
  'Ссылка на видео пропадёт из попытки. Форма вернётся — пришлёте другую ссылку.';

// ConfirmDialog сам закрывается после ответа сервера, успех это был или сбой
// (его же шапка) — уходить отсюда больше некуда: список сам покажет форму,
// как только AttemptScreen.tsx перечитает попытку (useAttemptMedia.removeMedia).
const STAY_ON_SCREEN = () => {};

interface AttemptQuestionVideoReceivedProps {
  received: ExamMediaDto[];
  video: AttemptVideoControls;
}

export function AttemptQuestionVideoReceived({
  received,
  video,
}: AttemptQuestionVideoReceivedProps) {
  const linkItem = received.find((item) => item.kind === 'link');
  const removeState = video.removeStateFor(linkItem?.id ?? '');
  const removeConfirm = useConfirmedRemove(
    linkItem ? () => video.removeMedia(linkItem.id) : undefined,
    STAY_ON_SCREEN,
  );

  return (
    <>
      <ul style={attemptVideoReceivedListStyle}>
        {received.map((item) => (
          <li key={item.id}>
            {formatExamMediaReceivedAt(item)}.
            {item.kind === 'link' && video.canChangeAnswer && (
              <div style={attemptVideoReceivedActionsStyle}>
                <TextLinkButton
                  disabled={removeState.pending}
                  onClick={() => void video.removeMedia(item.id)}
                >
                  {REPLACE_LABEL}
                </TextLinkButton>
                <TextLinkButton
                  danger
                  disabled={removeState.pending}
                  onClick={removeConfirm.requestRemove}
                >
                  {REMOVE_LABEL}
                </TextLinkButton>
              </div>
            )}
          </li>
        ))}
      </ul>
      <FormServerError error={removeState.error} />
      {removeConfirm.confirming && (
        <ConfirmDialog
          title={REMOVE_DIALOG_TITLE}
          message={REMOVE_DIALOG_MESSAGE}
          confirmLabel={REMOVE_CONFIRM_LABEL}
          pending={removeState.pending}
          onConfirm={removeConfirm.confirmRemove}
          onCancel={removeConfirm.cancelRemove}
        />
      )}
    </>
  );
}
