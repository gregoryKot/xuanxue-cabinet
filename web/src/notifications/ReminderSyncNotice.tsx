// Строка состояния под контролами напоминаний (ReminderSyncNotice — тип из
// reminderSyncState.ts): нет сети, исход записи проверяется, проверка не
// удалась, отказ сервера. Стоит под обоими блоками, которые делят один снимок
// (LessonScopeSection.tsx и LessonReminderField.tsx): у каждого контрол выключен,
// и человеку нужно видеть почему, а не искать причину в соседнем блоке. Отказ
// сервера рисуется только под тем контролом, что сохранял: «Выберите не больше
// 50 занятий» под полем «За сколько напомнить» сбивал бы с толку.
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { dangerNoteStyle, noteStyle } from '../components/screenLayout';
import { REMINDER_SYNC_NOTICE_TEXT, type ReminderChangeKind } from './reminderSyncState';
import type { UseReminderSyncResult } from './useReminderSync';

const RETRY_LABEL = 'Проверить ещё раз';

interface ReminderSyncNoticeProps {
  sync: UseReminderSyncResult;
  /** Контрол, под которым стоит строка. */
  control: ReminderChangeKind;
}

export function ReminderSyncNotice({ sync, control }: ReminderSyncNoticeProps) {
  const { notice, refusal, retryRead } = sync;

  return (
    <>
      {notice === 'checkFailed' && (
        <LoadErrorBanner
          message={REMINDER_SYNC_NOTICE_TEXT.checkFailed}
          onRetry={retryRead}
          retryLabel={RETRY_LABEL}
        />
      )}
      {/* role="status": строка появляется сама, без действия человека, —
          скринридер должен её произнести. */}
      {notice !== null && notice !== 'checkFailed' && (
        <p role="status" style={noteStyle}>
          {REMINDER_SYNC_NOTICE_TEXT[notice]}
        </p>
      )}
      {refusal?.kind === control && (
        <p role="alert" style={dangerNoteStyle}>
          {refusal.message}
        </p>
      )}
    </>
  );
}
