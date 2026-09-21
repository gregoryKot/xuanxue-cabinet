// Предпросмотр «глазами ученика» (ТЗ 4.3) — отдельная страница
// `/exams/:examId/preview`, а не слой поверх редактора (ADR-0033): бывший
// оверлей держал свой useHistorySheet/useDialog ради кнопки «Назад» браузера,
// теперь «Назад» ведёт к экзамену обычной навигацией, как у любой страницы.
//
// Показывает СОХРАНЁННЫЙ экзамен — страницу открывают по ссылке, и данные она
// читает сама (ExamPreviewScreen.tsx, useExamPreview.ts), а не несохранённое
// состояние формы редактора.
//
// Облик — как у сдачи (attempt/, направление «Тёплая школа», docs/adr/0043,
// заменил ADR-0031): учитель видит ровно то, что увидит ученик, той же
// вёрсткой, а не отдельным макетом.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ExamDto, ExamItemDto } from '@xuanxue/shared';
import { attemptHeaderStyle, attemptPageStyle } from '../attempt/attemptLayout';
import { noteStyle, screenTitleStyle } from '../components/screenLayout';
import { backLinkStyle } from '../components/editorLayout';
import {
  initialQuestionIds,
  initialQuestionsPerAttempt,
  initialRequiredIds,
  initialShuffleQuestions,
  pruneRequiredIds,
} from './examQuestions';
import { ExamPreviewQuestions } from './ExamPreviewQuestions';

const EXAMS_PATH = '/exams';
const BACK_TEXT = 'К экзамену';
const EYEBROW = 'Глазами ученика';
const PREVIEW_NOTE =
  'Так экзамен выглядит у ученика. Поля выключены — здесь ничего не сохраняется.';

const descriptionStyle: CSSProperties = {
  margin: 0,
  color: 'var(--ink-soft)',
  lineHeight: 1.5,
};

interface ExamPreviewProps {
  exam: ExamDto;
  bankItems: ExamItemDto[];
}

export function ExamPreview({ exam, bankItems }: ExamPreviewProps) {
  // Порядок и перемешивание вопросов — та же логика, что у формы редактора
  // (initialExamFormState, examFormInput.ts): один список вопросов на весь
  // экзамен, блок остался устройством хранилища (ADR-0033).
  const itemIds = initialQuestionIds(exam);
  const shuffleQuestions = initialShuffleQuestions(exam);
  const questionsPerAttempt = initialQuestionsPerAttempt(exam);
  // Пруним на случай рассинхрона данных (вопрос убрали, отметка не
  // сохранилась) — предпросмотр не должен посчитать обязательным вопрос,
  // которого в списке уже нет (ADR-0082, дополнение).
  const requiredIds = pruneRequiredIds(initialRequiredIds(exam), itemIds);

  return (
    <section style={attemptPageStyle}>
      <Link to={`${EXAMS_PATH}/${exam.id}`} style={backLinkStyle}>
        {BACK_TEXT}
      </Link>

      <div style={attemptHeaderStyle}>
        <span className="xuanxue-eyebrow">{EYEBROW}</span>
        <h1 style={screenTitleStyle}>{exam.title}</h1>
        {exam.description && <p style={descriptionStyle}>{exam.description}</p>}
      </div>

      <p style={noteStyle}>{PREVIEW_NOTE}</p>

      <ExamPreviewQuestions
        itemIds={itemIds}
        shuffleQuestions={shuffleQuestions}
        shuffleOptions={exam.shuffleOptions}
        questionsPerAttempt={questionsPerAttempt}
        requiredIds={requiredIds}
        bankItems={bankItems}
      />
    </section>
  );
}
