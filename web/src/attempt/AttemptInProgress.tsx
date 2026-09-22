// Форма сдачи, пока попытка «в работе» (ТЗ п.2) — отдельный компонент от
// AttemptScreen.tsx намеренно: `useAttemptAutosave` берёт ответы попытки
// один раз при монтировании (комментарий в самом хуке), а этот компонент
// монтируется только когда `attempt` уже точно загружен — на экране
// загрузки/ошибки его ещё нет. Так автосохранение не стартует со снимком-
// пустышкой, полученным до ответа сервера.
//
// Облик — направление «Тёплая школа» (docs/adr/0043-visual-direction-warm-
// school.md, заменил ADR-0031; владелец согласовал перевод экрана
// 2026-09-20): рубрика «Экзамен», название антиквой над карточкой вопросов
// (`blockCardStyle` — общий экспорт из components/listCardStyles.ts), одна
// заливка терракотой в подвале (AttemptSubmitBar.tsx). Экран открывают с
// телефона, поэтому колонка и цели нажатия считаются от 360 пикселей
// (CLAUDE.md «Мобильный экран первым»).
//
// «Экзамен закончен» решает только сервер (ТЗ 4.4, п.7, блокер аудита
// 2026-09-15 «Дедлайн решает сервер»): этот компонент вообще не показывает
// свой терминальный экран — AttemptScreen.tsx уже переключает на
// AttemptSubmitted по `attempt.status`, пришедшему с сервера. Живой отсчёт и
// связанный с ним повторный запрос при локальном «время вышло» — целиком в
// AttemptDeadlineTimer.tsx (её же комментарий-шапка): часы телефона, что
// спешат, раньше запирали ученика в честной попытке навсегда, а часы, что
// отстают, оставляли автосохранение писать в уже закрытую попытку без
// единого слова об этом — вторую половину чинит `onExpired` в
// useAttemptAutosave.
import { useCallback, useState } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { FormError } from '../components/FormServerError';
import { blockCardStyle } from '../components/listCardStyles';
import { screenTitleStyle } from '../components/screenLayout';
import { AttemptBlock } from './AttemptBlock';
import { AttemptDeadlineTimer } from './AttemptDeadlineTimer';
import { AttemptSubmitBar } from './AttemptSubmitBar';
import { ATTEMPT_EYEBROW, attemptHeaderStyle, attemptPageStyle } from './attemptLayout';
import { formatSaveStatus } from './attemptSaveStatusLabel';
import { useAttemptAutosave } from './useAttemptAutosave';
import type { AttemptVideoControls } from './useAttemptMedia';

// Отправка ждёт сохранения (аудит 2026-09-21, HIGH «потеря последнего ответа
// ученика», docs/PLAN.md §11): раньше submit() (useAttempt.ts) слал POST не
// дожидаясь PATCH — выбор варианта в последние секунды или гонка PATCH/POST
// теряли ответ, сервер отвечал «попытка уже не in_progress»
// (exam-attempt-save.ts). Текст — VOICE.md: на «вы», с действием.
const FLUSH_ERROR_MESSAGE =
  'Не удалось сохранить последний ответ. Проверьте интернет и попробуйте ещё раз.';

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
  const [flushError, setFlushError] = useState<FormError | null>(null);
  const [flushing, setFlushing] = useState(false);

  // Отправка ждёт flush() (см. константу выше): PATCH и POST раньше летели
  // не дожидаясь друг друга — теперь submit() зовётся, только когда все
  // правки реально на сервере. ConfirmDialog закрывает себя после
  // `onConfirm` независимо от исхода (ConfirmDialog.tsx) — эта функция не
  // бросает, иначе диалог остался бы открыт, а текст ошибки под ним.
  const handleSubmit = useCallback(async () => {
    setFlushing(true);
    try {
      await autosave.flush();
    } catch {
      setFlushError({ message: FLUSH_ERROR_MESSAGE });
      return;
    } finally {
      setFlushing(false);
    }
    setFlushError(null);
    await onSubmit();
  }, [autosave, onSubmit]);

  return (
    <section style={attemptPageStyle}>
      <div style={attemptHeaderStyle}>
        <span className="xuanxue-eyebrow">{ATTEMPT_EYEBROW}</span>
        <h1 style={screenTitleStyle}>{attempt.examTitle}</h1>
      </div>

      {/* Отдельный компонент, не строка здесь же: тикает раз в секунду сам
          по себе, не перерисовывая форму из полусотни вопросов ниже (её же
          комментарий-шапка). Прямой потомок секции, а не вложен в шапку выше
          — `position: sticky` внутри AttemptDeadlineTimer.tsx ограничен
          высотой родителя, и маленькая шапка не даёт отсчёту оставаться
          видимым дольше первых своих пикселей прокрутки. Формы без лимита
          времени не монтируют его вовсе — незачем будить React раз в секунду
          там, где считать нечего. */}
      {attempt.deadlineAt && (
        <AttemptDeadlineTimer
          deadlineAt={attempt.deadlineAt}
          onExpired={() => void reload()}
        />
      )}

      <div style={blockCardStyle}>
        {attempt.blocks.map((block) => (
          <AttemptBlock key={block.id} block={block} autosave={autosave} video={video} />
        ))}
      </div>

      <AttemptSubmitBar
        saveLabel={formatSaveStatus(autosave.status)}
        onSubmit={handleSubmit}
        submitting={flushing || submitting}
        submitError={flushError ?? submitError}
      />
    </section>
  );
}
