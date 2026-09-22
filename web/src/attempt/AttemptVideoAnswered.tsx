// Видео-вопрос, на который уже ответили, и видео-вопрос уже проверенной
// работы (ADR-0086) — вынесено из AttemptQuestionVideo.tsx, где остался путь
// первого ответа (ссылка → инструкция → бот, ADR-0084): там файл-лимит
// CLAUDE.md, а эти два состояния короткие и оба про «ответ уже дан».
//
// Ответ есть — форма ссылки не прячется. Раньше пряталась, и довод был
// «показать форму заново читается как „кабинет не поверил“»; он перестал
// работать, когда выяснилось, что ошибочную ссылку иначе не исправить ничем:
// отдельного «удалить» нет, новая ссылка заменяет прежнюю (ADR-0086).
// Кнопки бота здесь нет — видео из Telegram заменить нельзя (их бывает
// несколько на один вопрос, ADR-0023), звать туда второй раз незачем.
//
// Работу уже проверили — ни формы, ни бота, только честная строка: бэкенд
// такую ссылку не примет (ADR-0086), а контрол, который всегда получает
// отказ, хуже, чем его отсутствие.
import { useState } from 'react';
import { EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE, type ExamMediaDto } from '@xuanxue/shared';
import { cardListStyle } from '../components/listCardStyles';
import { TextLinkButton } from '../components/TextLinkButton';
import { AttemptMediaLinkForm } from './AttemptMediaLinkForm';
import { AttemptVideoAnswerRow } from './AttemptVideoAnswerRow';
import { attemptVideoHintStyle } from './attemptVideoStyles';
import type { AttemptVideoControls } from './useAttemptMedia';

// Форма замены убрана под тихое действие, а не стоит раскрытой: ответ уже
// дан, и открытое поле с терракотовой кнопкой читалось на экране громче
// самого ответа — будто ничего ещё не сделано (снимок владельца 2026-09-21).
// Заливка акцентом на экране одна (правило акцента, docs/adr/0031), и она
// принадлежит главному действию, а замена ошибочной ссылки — действие
// второго плана.
const REPLACE_TOGGLE = 'Прислать другую ссылку';

interface AttemptVideoAnsweredProps {
  itemId: string;
  video: AttemptVideoControls;
  /** Уже полученное по этому вопросу — пусто бывает только у проверенной
   * работы, где ответа так и не случилось. */
  received: ExamMediaDto[];
}

export function AttemptVideoAnswered({
  itemId,
  video,
  received,
}: AttemptVideoAnsweredProps) {
  const { pending, error } = video.linkStateFor(itemId);
  const [replacing, setReplacing] = useState(false);

  return (
    <>
      {received.length > 0 && (
        <ul style={cardListStyle}>
          {received.map((item) => (
            <AttemptVideoAnswerRow key={item.id} media={item} />
          ))}
        </ul>
      )}

      {video.acceptsAnswers ? (
        <>
          <TextLinkButton
            onClick={() => setReplacing((open) => !open)}
            aria-expanded={replacing}
          >
            {REPLACE_TOGGLE}
          </TextLinkButton>
          {replacing && (
            <AttemptMediaLinkForm
              onSubmit={(url) => video.addMediaLink(itemId, url)}
              pending={pending}
              error={error}
            />
          )}
        </>
      ) : (
        <p style={attemptVideoHintStyle}>{EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE}</p>
      )}
    </>
  );
}
