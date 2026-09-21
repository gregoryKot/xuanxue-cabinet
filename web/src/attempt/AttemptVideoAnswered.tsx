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
import { EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE, type ExamMediaDto } from '@xuanxue/shared';
import { formatExamMediaReceivedAt } from '../lib/examMedia';
import { AttemptMediaLinkForm } from './AttemptMediaLinkForm';
import {
  attemptVideoHintStyle,
  attemptVideoReceivedListStyle,
} from './attemptVideoStyles';
import type { AttemptVideoControls } from './useAttemptMedia';

const REPLACE_LINK_HINT = 'Прислали не ту ссылку? Вставьте новую — она заменит прежнюю.';

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

  return (
    <>
      {received.length > 0 && (
        <ul style={attemptVideoReceivedListStyle}>
          {received.map((item) => (
            <li key={item.id}>{formatExamMediaReceivedAt(item)}.</li>
          ))}
        </ul>
      )}

      {video.acceptsAnswers ? (
        <>
          <p style={attemptVideoHintStyle}>{REPLACE_LINK_HINT}</p>
          <AttemptMediaLinkForm
            onSubmit={(url) => video.addMediaLink(itemId, url)}
            pending={pending}
            error={error}
          />
        </>
      ) : (
        <p style={attemptVideoHintStyle}>{EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE}</p>
      )}
    </>
  );
}
