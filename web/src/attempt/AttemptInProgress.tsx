// Форма сдачи, пока попытка «в работе» (ТЗ п.2) — отдельный компонент от
// AttemptScreen.tsx намеренно: `useAttemptAutosave` берёт ответы попытки
// один раз при монтировании (комментарий в самом хуке), а этот компонент
// монтируется только когда `attempt` уже точно загружен — на экране
// загрузки/ошибки его ещё нет. Так автосохранение не стартует со снимком-
// пустышкой, полученным до ответа сервера.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ATTEMPT_EXPIRED_MESSAGE, type ExamAttemptDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError, type FormError } from '../components/FormServerError';
import {
  screenExplanationStyle,
  screenHintStyle,
  screenSectionStyle,
} from '../components/screenLayout';
import { AttemptBlock } from './AttemptBlock';
import { getAttemptTimeStatus } from './attemptDeadline';
import { formatSaveStatus } from './attemptSaveStatusLabel';
import { useAttemptAutosave } from './useAttemptAutosave';
import { useNow } from './useNow';

const NOW_REFRESH_MS = 30_000;
const SUBMIT_CONFIRM_MESSAGE =
  'После отправки менять ответы будет нельзя. Учитель проверит и пришлёт результат.';

interface AttemptInProgressProps {
  attempt: ExamAttemptDto;
  reload: () => Promise<void>;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  submitError: FormError | null;
}

export function AttemptInProgress({
  attempt,
  reload,
  onSubmit,
  submitting,
  submitError,
}: AttemptInProgressProps) {
  const autosave = useAttemptAutosave(attempt.id, attempt.answers);
  const now = useNow(NOW_REFRESH_MS);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const timeStatus = getAttemptTimeStatus(attempt.deadlineAt, now);
  const reloadedForExpiry = useRef(false);

  // Локальный отсчёт добежал до нуля раньше, чем об этом узнал сервер —
  // перечитываем попытку один раз, чтобы увидеть настоящий статус
  // (ExamAttemptsService.closeIfExpiredAttempt закрывает её на любом
  // запросе, включая этот GET /attempts).
  useEffect(() => {
    if (!timeStatus.expired || reloadedForExpiry.current) return;
    reloadedForExpiry.current = true;
    void reload();
  }, [timeStatus.expired, reload]);

  if (timeStatus.expired) {
    return (
      <section style={screenSectionStyle}>
        <h1 style={{ margin: 0, fontSize: 18 }}>{attempt.examTitle}</h1>
        <p role="alert">{ATTEMPT_EXPIRED_MESSAGE}</p>
        <Link to="/">Вернуться к экзаменам</Link>
      </section>
    );
  }

  const saveLabel = formatSaveStatus(autosave.status);

  return (
    <section style={screenSectionStyle}>
      <h1 style={{ margin: 0, fontSize: 18 }}>{attempt.examTitle}</h1>
      {timeStatus.label && <p style={screenHintStyle}>{timeStatus.label}</p>}

      {attempt.blocks.map((block) => (
        <AttemptBlock key={block.id} block={block} autosave={autosave} />
      ))}

      {saveLabel && (
        <p aria-live="polite" style={screenExplanationStyle}>
          {saveLabel}
        </p>
      )}

      <Button type="button" onClick={() => setConfirmingSubmit(true)}>
        Отправить
      </Button>
      <FormServerError error={submitError} />

      {confirmingSubmit && (
        <ConfirmDialog
          title="Отправить экзамен?"
          message={SUBMIT_CONFIRM_MESSAGE}
          confirmLabel="Отправить"
          confirmVariant="primary"
          pending={submitting}
          onConfirm={onSubmit}
          onCancel={() => setConfirmingSubmit(false)}
        />
      )}
    </section>
  );
}
