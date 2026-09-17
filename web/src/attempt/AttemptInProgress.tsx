// Форма сдачи, пока попытка «в работе» (ТЗ п.2) — отдельный компонент от
// AttemptScreen.tsx намеренно: `useAttemptAutosave` берёт ответы попытки
// один раз при монтировании (комментарий в самом хуке), а этот компонент
// монтируется только когда `attempt` уже точно загружен — на экране
// загрузки/ошибки его ещё нет. Так автосохранение не стартует со снимком-
// пустышкой, полученным до ответа сервера.
//
// Облик — направление «тихо и благородно» (docs/adr/0031): рубрика «Экзамен»,
// название антиквой, оставшееся время тихой припиской, вопросы строками на
// волосяных линиях, одна киноварь в подвале (AttemptSubmitBar.tsx). Экран
// открывают с телефона, поэтому колонка и цели нажатия считаются от 360
// пикселей (CLAUDE.md «Мобильный экран первым»).
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
import { useEffect, useRef } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { FormError } from '../components/FormServerError';
import { screenHintStyle, screenTitleStyle } from '../components/screenLayout';
import { AttemptBlock } from './AttemptBlock';
import { AttemptSubmitBar } from './AttemptSubmitBar';
import { getAttemptTimeStatus } from './attemptDeadline';
import { ATTEMPT_EYEBROW, attemptHeaderStyle, attemptPageStyle } from './attemptLayout';
import { formatSaveStatus } from './attemptSaveStatusLabel';
import { useAttemptAutosave } from './useAttemptAutosave';
import type { AttemptVideoControls } from './useAttemptMedia';
import { useNow } from './useNow';

const NOW_REFRESH_MS = 30_000;

// Приписку держит `gap` шапки — отрицательный отступ screenHintStyle
// подтянул бы её вплотную к заголовку (тот же приём, что StudentScreen.tsx).
const deadlineStyle = { ...screenHintStyle, margin: 0 };

interface AttemptInProgressProps {
  attempt: ExamAttemptDto;
  reload: () => Promise<void>;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  submitError: FormError | null;
  video: AttemptVideoControls;
}

export function AttemptInProgress({
  attempt,
  reload,
  onSubmit,
  submitting,
  submitError,
  video,
}: AttemptInProgressProps) {
  // `reload` как `onExpired` — сервер отклонил сохранение по дедлайну,
  // перечитываем попытку и показываем то, что скажет она (см. комментарий
  // в шапке файла и в самом useAttemptAutosave). Обёртка в `() => void ...`
  // — `onExpired` синхронный, а `reload()` возвращает `Promise<void>`.
  const autosave = useAttemptAutosave(attempt.id, attempt.answers, () => void reload());
  const now = useNow(NOW_REFRESH_MS);
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

  return (
    <section style={attemptPageStyle}>
      <div style={attemptHeaderStyle}>
        <span className="xuanxue-eyebrow">{ATTEMPT_EYEBROW}</span>
        <h1 style={screenTitleStyle}>{attempt.examTitle}</h1>
        {timeStatus.label && <p style={deadlineStyle}>{timeStatus.label}</p>}
      </div>

      {attempt.blocks.map((block) => (
        <AttemptBlock key={block.id} block={block} autosave={autosave} video={video} />
      ))}

      <AttemptSubmitBar
        saveLabel={formatSaveStatus(autosave.status)}
        onSubmit={onSubmit}
        submitting={submitting}
        submitError={submitError}
      />
    </section>
  );
}
