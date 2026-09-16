// Экран «Отправлено» (ТЗ п.2) — после успешной отправки и при возврате на
// уже отправленную/проверенную попытку (обновление страницы отдаёт тот же
// статус с сервера, GET /attempts). Результата с баллами и комментарием
// здесь нет — рубрика и оценка появятся вместе со слоем 4.6/4.7
// (docs/PLAN.md §11), сейчас взять их неоткуда. Блок «Видео» (ADR-0023,
// слой 4.5) показан для любого статуса ниже, включая «Проверен»: попытка
// одна и та же, и видео к ней может понадобиться независимо от того, когда
// его прислали — до оценки или после.
import { Link } from 'react-router-dom';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { FormError } from '../components/FormServerError';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';
import { AttemptMediaPrompt } from './AttemptMediaPrompt';

function describeSubmitted(attempt: ExamAttemptDto): string {
  if (attempt.status === 'graded') return 'Экзамен проверен.';
  if (attempt.expired) return 'Время вышло, попытка закрыта и отправлена на проверку.';
  return 'Отправлено. Учитель проверит и пришлёт результат.';
}

interface AttemptSubmittedProps {
  attempt: ExamAttemptDto;
  telegramBotUsername?: string;
  telegramLinked: boolean;
  onAddMediaLink: (url: string) => Promise<boolean>;
  addingMediaLink: boolean;
  addMediaLinkError: FormError | null;
}

export function AttemptSubmitted({
  attempt,
  telegramBotUsername,
  telegramLinked,
  onAddMediaLink,
  addingMediaLink,
  addMediaLinkError,
}: AttemptSubmittedProps) {
  return (
    <section style={screenSectionStyle}>
      <h1 style={{ margin: 0, fontSize: 18 }}>{attempt.examTitle}</h1>
      <p style={screenExplanationStyle}>{describeSubmitted(attempt)}</p>

      <AttemptMediaPrompt
        attempt={attempt}
        telegramBotUsername={telegramBotUsername}
        telegramLinked={telegramLinked}
        onAddMediaLink={onAddMediaLink}
        addingMediaLink={addingMediaLink}
        addMediaLinkError={addMediaLinkError}
      />

      <p style={{ margin: 0 }}>
        <Link to="/">Вернуться к экзаменам</Link>
      </p>
    </section>
  );
}
