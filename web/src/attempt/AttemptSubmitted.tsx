// Экран «Отправлено» (ТЗ п.2) — после успешной отправки и при возврате на
// уже отправленную/проверенную попытку (обновление страницы отдаёт тот же
// статус с сервера, GET /attempts). Итога с комментарием здесь нет и не
// будет: они живут ТОЛЬКО на карточке экзамена в кабинете
// (web/src/student/ExamAttemptOutcome.tsx), куда ученик и возвращается
// ссылкой ниже — два места с одним и тем же итогом читались бы как два
// сообщения об одном. К тому же технически иначе и нельзя: ученику
// `ExamAttemptDto.outcome` вовсе не приходит — поле помечено «только
// сотруднику школы» (комментарий у него в shared/src/exam-attempts.ts). Раздел
// «Ваши ответы» ниже (AttemptSubmittedAnswers.tsx, docs/adr/0123) —
// не итог, а протокол уже сделанного: сама сдача, без оценки.
// Блок «Видео» (ADR-0037) показан для любого статуса ниже, включая
// «Проверен»: попытка одна и та же, и видео к её вопросам может
// понадобиться независимо от того, когда его прислали — до оценки или
// после. Сам блок — AttemptSubmittedVideos.tsx, по вопросу на каждый
// видео-вопрос попытки, а не одна форма на попытку целиком (ADR-0037:
// видео — ответ на вопрос).
//
// Облик тот же, что у формы сдачи (attemptLayout.ts, направление «Тёплая
// школа», docs/adr/0043, заменил ADR-0031): рубрика, название антиквой,
// одна заливка терракотой — «Отправить видео боту» в блоке ниже. «Вернуться
// к экзаменам» — текстовая ссылка за волосяной линией: ученик здесь уже всё
// сделал, и второй заметной кнопкой этот шаг не является.
import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { useAuth } from '../auth/AuthProvider';
import {
  screenExplanationStyle,
  screenTitleStyle,
  textLinkStyle,
} from '../components/screenLayout';
import { showsTelegramOffer } from '../telegram/showsTelegramOffer';
import { TelegramLinkButton } from '../telegram/TelegramLinkButton';
import { AttemptSubmittedAnswers } from './AttemptSubmittedAnswers';
import { AttemptSubmittedVideos } from './AttemptSubmittedVideos';
import { ATTEMPT_EYEBROW, attemptHeaderStyle, attemptPageStyle } from './attemptLayout';
import { collectVideoQuestions } from './attemptVideoQuestions';
import type { AttemptVideoControls } from './useAttemptMedia';

const BACK_TEXT = 'Вернуться к экзаменам';
// Своя причина связки на этом экране (проп `explanation` у TelegramLinkButton,
// ADR-0034): здесь речь про результат проверки, а не про отправку видео.
const TELEGRAM_OFFER_EXPLANATION =
  'Свяжите Telegram — бот напишет, как только учитель поставит итог, ' +
  'и заходить за результатом не придётся.';

const backStyle: CSSProperties = {
  margin: 0,
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};

// «Пришлёт результат» держалось на письме-резерве (ADR-0039); письма больше
// нет (ADR-0061), и обещать отправку тому, у кого нет бота, экран не вправе.
// Поэтому говорим то, что верно для каждого: итог с комментарием ляжет на
// карточку экзамена в кабинете — туда и ведёт ссылка внизу.
function describeSubmitted(attempt: ExamAttemptDto): string {
  if (attempt.status === 'graded') return 'Экзамен проверен.';
  if (attempt.expired) return 'Время вышло, попытка закрыта и отправлена на проверку.';
  return 'Отправлено. Учитель проверит — результат будет на карточке экзамена в кабинете.';
}

interface AttemptSubmittedProps {
  attempt: ExamAttemptDto;
  video: AttemptVideoControls;
}

export function AttemptSubmitted({ attempt, video }: AttemptSubmittedProps) {
  const { me } = useAuth();
  // Одно предложение связать Telegram на экран (ADR-0066). У попытки с
  // видео-вопросами кнопку уже рисует AttemptQuestionVideo — по своей
  // причине (без связки бот не поймёт, чьё видео пришло, ADR-0023) и у
  // каждого вопроса; вторая кнопка рядом, с другим объяснением, читалась бы
  // как две разные связки. Экранное предложение уступает вопросному и
  // выходит там, где вопросного нет вовсе, — то есть ровно для того, кто
  // иначе не увидит про Telegram ничего.
  const offersTelegram =
    showsTelegramOffer(me) && collectVideoQuestions(attempt).length === 0;

  return (
    <section style={attemptPageStyle}>
      <div style={attemptHeaderStyle}>
        <span className="xuanxue-eyebrow">{ATTEMPT_EYEBROW}</span>
        <h1 style={screenTitleStyle}>{attempt.examTitle}</h1>
        <p style={screenExplanationStyle}>{describeSubmitted(attempt)}</p>
      </div>

      {offersTelegram && <TelegramLinkButton explanation={TELEGRAM_OFFER_EXPLANATION} />}

      <AttemptSubmittedAnswers attempt={attempt} />
      <AttemptSubmittedVideos attempt={attempt} video={video} />

      <p style={backStyle}>
        <Link to="/" style={textLinkStyle}>
          {BACK_TEXT}
        </Link>
      </p>
    </section>
  );
}
