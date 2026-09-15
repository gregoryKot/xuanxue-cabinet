// Форма сдачи, пока попытка «в работе» (ТЗ п.2) — отдельный компонент от
// AttemptScreen.tsx намеренно: `useAttemptAutosave` берёт ответы попытки
// один раз при монтировании (комментарий в самом хуке), а этот компонент
// монтируется только когда `attempt` уже точно загружен — на экране
// загрузки/ошибки его ещё нет. Так автосохранение не стартует со снимком-
// пустышкой, полученным до ответа сервера.
//
// «Экзамен закончен» решает только сервер (ТЗ 4.4, п.7, блокер аудита
// 2026-09-15 «Дедлайн решает сервер»): этот компонент вообще не показывает
// свой терминальный экран — AttemptScreen.tsx уже переключает на
// AttemptSubmitted по `attempt.status`, пришедшему с сервера. Локальный
// `timeStatus` из attemptDeadline.ts — только отображение (её же
// комментарий-шапка): часы телефона, что спешат, раньше запирали ученика
// в честной попытке навсегда (`timeStatus.expired` не меняется обратно, даже
// когда сервер отвечает «ещё не время»), а часы, что отстают, оставляли
// автосохранение писать в уже закрытую попытку без единого слова об этом —
// вторую половину чинит `onExpired` в useAttemptAutosave.
import { useEffect, useRef, useState } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
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
  // `reload` как `onExpired` — сервер отклонил сохранение по дедлайну,
  // перечитываем попытку и показываем то, что скажет она (см. комментарий
  // в шапке файла и в самом useAttemptAutosave). Обёртка в `() => void ...`
  // — `onExpired` синхронный, а `reload()` возвращает `Promise<void>`.
  const autosave = useAttemptAutosave(attempt.id, attempt.answers, () => void reload());
  const now = useNow(NOW_REFRESH_MS);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const timeStatus = getAttemptTimeStatus(attempt.deadlineAt, now);
  const reloadedForExpiry = useRef(false);

  // Локальный отсчёт добежал до нуля раньше, чем об этом узнал сервер —
  // перечитываем попытку один раз, чтобы увидеть настоящий статус
  // (ExamAttemptsService.closeIfExpiredAttempt закрывает её на любом
  // запросе, включая этот GET /attempts). Сам факт локального «времени
  // вышло» экран не показывает как приговор — только как повод спросить
  // сервер: часы телефона спешат чаще, чем отстают, и «заперли до звонка
  // учителю» хуже, чем лишний перезапрос.
  useEffect(() => {
    if (!timeStatus.expired || reloadedForExpiry.current) return;
    reloadedForExpiry.current = true;
    void reload();
  }, [timeStatus.expired, reload]);

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
