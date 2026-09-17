// Экран «Отправлено» (ТЗ п.2) — после успешной отправки и при возврате на
// уже отправленную/проверенную попытку (обновление страницы отдаёт тот же
// статус с сервера, GET /attempts). Результата с баллами и комментарием
// здесь нет — рубрика и оценка появятся вместе со слоем 4.6/4.7
// (docs/PLAN.md §11), сейчас взять их неоткуда. Блок «Видео» (ADR-0037)
// показан для любого статуса ниже, включая «Проверен»: попытка одна и та
// же, и видео к её вопросам может понадобиться независимо от того, когда
// его прислали — до оценки или после. Сам блок — AttemptSubmittedVideos.tsx,
// по вопросу на каждый видео-вопрос попытки, а не одна форма на попытку
// целиком (ADR-0037: видео — ответ на вопрос).
//
// Облик тот же, что у формы сдачи (attemptLayout.ts): рубрика, название
// антиквой, одна киноварь — «Отправить видео боту» в блоке ниже. «Вернуться
// к экзаменам» — текстовая ссылка за волосяной линией: ученик здесь уже всё
// сделал, и второй заметной кнопкой этот шаг не является.
import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import {
  screenExplanationStyle,
  screenTitleStyle,
  textLinkStyle,
} from '../components/screenLayout';
import { AttemptSubmittedVideos } from './AttemptSubmittedVideos';
import { ATTEMPT_EYEBROW, attemptHeaderStyle, attemptPageStyle } from './attemptLayout';
import type { AttemptVideoControls } from './useAttemptMedia';

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
  video: AttemptVideoControls;
}

export function AttemptSubmitted({ attempt, video }: AttemptSubmittedProps) {
  return (
    <section style={attemptPageStyle}>
      <div style={attemptHeaderStyle}>
        <span className="xuanxue-eyebrow">{ATTEMPT_EYEBROW}</span>
        <h1 style={screenTitleStyle}>{attempt.examTitle}</h1>
        <p style={screenExplanationStyle}>{describeSubmitted(attempt)}</p>
      </div>

      <AttemptSubmittedVideos attempt={attempt} video={video} />

      <p style={backStyle}>
        <Link to="/" style={textLinkStyle}>
          {BACK_TEXT}
        </Link>
      </p>
    </section>
  );
}
