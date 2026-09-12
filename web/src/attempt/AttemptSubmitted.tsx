// Экран «Отправлено» (ТЗ п.2) — после успешной отправки и при возврате на
// уже отправленную/проверенную попытку (обновление страницы отдаёт тот же
// статус с сервера, GET /attempts). Результата с баллами и комментарием
// здесь нет — рубрика и оценка появятся вместе со слоем 4.6/4.7
// (docs/PLAN.md §11), сейчас взять их неоткуда.
import { Link } from 'react-router-dom';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { screenExplanationStyle, screenSectionStyle } from '../components/screenLayout';

function describeSubmitted(attempt: ExamAttemptDto): string {
  if (attempt.status === 'graded') return 'Экзамен проверен.';
  if (attempt.expired) return 'Время вышло, попытка закрыта и отправлена на проверку.';
  return 'Отправлено. Учитель проверит и пришлёт результат.';
}

interface AttemptSubmittedProps {
  attempt: ExamAttemptDto;
}

export function AttemptSubmitted({ attempt }: AttemptSubmittedProps) {
  return (
    <section style={screenSectionStyle}>
      <h1 style={{ margin: 0, fontSize: 18 }}>{attempt.examTitle}</h1>
      <p style={screenExplanationStyle}>{describeSubmitted(attempt)}</p>
      <p style={{ margin: 0 }}>
        <Link to="/">Вернуться к экзаменам</Link>
      </p>
    </section>
  );
}
