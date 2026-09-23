// Блок видео карточки проверки (ADR-0023, ADR-0037, ТЗ п.4.5/4.6) — что
// получено и когда, своя строка записи через AttemptReviewMediaItem.tsx
// (там же кнопка «Прислать мне в Telegram» и что показывать без активного
// чата с ботом — вынесено отдельным файлом, чтобы список не разросся выше
// файлового лимита, CLAUDE.md «Храповики»). Видео теперь ответ конкретного
// вопроса, а не попытки целиком: компонент переиспользуется и внутри
// карточки видео-вопроса (AttemptReviewQuestion.tsx, без `heading` —
// формулировка вопроса рядом уже говорит, что это), и в блоке «Видео без
// вопроса» на всю попытку (AttemptReviewAnswers.tsx, `heading` задан). Видео
// нет вовсе — кнопка «Отметить, что видео принято» (третий путь ADR-0023),
// только когда `onMarkManual` передан (у «без вопроса» нет своего вопроса,
// чтобы к нему отмечать, — кнопки там не бывает): учитель мог получить
// видео другим способом и должен иметь возможность закрыть случай, не
// дожидаясь, пока ученик разберётся с Telegram или со ссылкой. Строка
// списка, не карточка (направление «тихо и благородно», docs/adr/0031) —
// та же волосяная линия, что у вопроса (AttemptReviewQuestion.tsx).
import type { CSSProperties } from 'react';
import type { ExamMediaDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { FormServerError, type FormError } from '../components/FormServerError';
import { RichText } from '../components/RichText';
import { AttemptReviewMediaItem } from './AttemptReviewMediaItem';
import type { SendMediaState } from './useAttemptReviewMedia';

const NO_MEDIA_TEXT = 'Видео пока не получено.';
const titleStyle: CSSProperties = {
  margin: '0 0 8px',
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: 20,
};
const descriptionStyle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  color: 'var(--ink-soft)',
};
const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

interface AttemptReviewMediaProps {
  media: ExamMediaDto[];
  /** Заголовок над блоком. Без него — как у видео-вопроса (карточка сама
   * называет вопрос строкой формулировки): второй заголовок был бы лишним. */
  heading?: string;
  /** Короткое пояснение под заголовком, откуда блок и что с ним делать
   * (docs/VOICE.md) — только там, где заголовок сам по себе не объясняет
   * (блок «без вопроса», AttemptReviewAnswers.tsx). У видео-вопроса не задан
   * по той же причине, что и heading. */
  description?: string;
  /** Только там, где у видео есть свой вопрос: без него нечего отмечать. */
  onMarkManual?: () => Promise<boolean>;
  marking?: boolean;
  markError?: FormError | null;
  /** «Прислать мне в Telegram» (AttemptReviewMediaItem.tsx) — в отличие от
   * onMarkManual, нужна в обоих местах вызова: запись существует независимо
   * от того, есть ли у неё свой вопрос. */
  onSendToMe: (mediaId: string) => Promise<boolean>;
  sendStateFor: (mediaId: string) => SendMediaState;
  botChatActive: boolean;
  offersTelegramLink: boolean;
}

export function AttemptReviewMedia({
  media,
  heading,
  description,
  onMarkManual,
  marking = false,
  markError = null,
  onSendToMe,
  sendStateFor,
  botChatActive,
  offersTelegramLink,
}: AttemptReviewMediaProps) {
  return (
    <section>
      {heading && <h3 style={titleStyle}>{heading}</h3>}
      {description && (
        <p style={descriptionStyle}>
          <RichText text={description} />
        </p>
      )}

      {media.length === 0 ? (
        <>
          <p style={{ margin: '0 0 8px' }}>{NO_MEDIA_TEXT}</p>
          {onMarkManual && (
            <Button
              variant="secondary"
              pending={marking}
              onClick={() => void onMarkManual()}
            >
              Отметить, что видео принято
            </Button>
          )}
          <FormServerError error={markError} />
        </>
      ) : (
        <ul style={listStyle}>
          {media.map((item) => {
            const sendState = sendStateFor(item.id);
            return (
              <AttemptReviewMediaItem
                key={item.id}
                item={item}
                onSendToMe={() => onSendToMe(item.id)}
                sending={sendState.pending}
                sendError={sendState.error}
                sent={sendState.sent}
                botChatActive={botChatActive}
                offersTelegramLink={offersTelegramLink}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
