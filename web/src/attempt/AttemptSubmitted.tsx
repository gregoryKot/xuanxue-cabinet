// Экран «Отправлено» (ТЗ п.2) — после успешной отправки и при возврате на
// уже отправленную/проверенную попытку (обновление страницы отдаёт тот же
// статус с сервера, GET /attempts). Итога с комментарием здесь нет: их
// видно на карточке экзамена в кабинете (web/src/student), куда ученик и
// возвращается ссылкой ниже, — этот экран говорит только про саму сдачу. Блок «Видео» (ADR-0023,
// слой 4.5) показан для любого статуса ниже, включая «Проверен»: попытка
// одна и та же, и видео к ней может понадобиться независимо от того, когда
// его прислали — до оценки или после.
//
// Облик тот же, что у формы сдачи (attemptLayout.ts): рубрика, название
// антиквой, одна киноварь — «Отправить видео боту» в блоке ниже. «Вернуться
// к экзаменам» — текстовая ссылка за волосяной линией: ученик здесь уже всё
// сделал, и второй заметной кнопкой этот шаг не является.
import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { FormError } from '../components/FormServerError';
import {
  screenExplanationStyle,
  screenTitleStyle,
  textLinkStyle,
} from '../components/screenLayout';
import { AttemptMediaPrompt } from './AttemptMediaPrompt';
import { ATTEMPT_EYEBROW, attemptHeaderStyle, attemptPageStyle } from './attemptLayout';

const BACK_TEXT = 'Вернуться к экзаменам';

const backStyle: CSSProperties = {
  margin: 0,
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};

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
    <section style={attemptPageStyle}>
      <div style={attemptHeaderStyle}>
        <span className="xuanxue-eyebrow">{ATTEMPT_EYEBROW}</span>
        <h1 style={screenTitleStyle}>{attempt.examTitle}</h1>
        <p style={screenExplanationStyle}>{describeSubmitted(attempt)}</p>
      </div>

      <AttemptMediaPrompt
        attempt={attempt}
        telegramBotUsername={telegramBotUsername}
        telegramLinked={telegramLinked}
        onAddMediaLink={onAddMediaLink}
        addingMediaLink={addingMediaLink}
        addMediaLinkError={addMediaLinkError}
      />

      <p style={backStyle}>
        <Link to="/" style={textLinkStyle}>
          {BACK_TEXT}
        </Link>
      </p>
    </section>
  );
}
