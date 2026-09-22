// Поле ответа только для чтения — общий код для двух мест, где вопрос
// показывают, а отвечать нельзя: предпросмотр учителя «глазами ученика»
// (exams/ExamPreviewQuestion.tsx) и своя сданная работа
// (AttemptSubmittedAnswers.tsx). Ветвление по `kind` раньше жило только в
// предпросмотре — второе такое же место поймал бы jscpd (CLAUDE.md «Одна
// механика — один компонент»).
//
// `video` здесь не обрабатывается: у видео-ответа нет поля ввода, и у
// каждого места свой блок под него (предпросмотр — AttemptQuestionVideoNote,
// «Отправлено» — блок «Видео», AttemptSubmittedVideos.tsx).
//
// Пропсы компонентов сдачи обязательные — там без обработчика нельзя.
// `IGNORE_INPUT` — пустой обработчик: поля выключены (`disabled`), реально
// не вызывается.
import type { AttemptOptionDto, ExamItemKind } from '@xuanxue/shared';
import { AttemptQuestionChoice } from './AttemptQuestionChoice';
import { AttemptQuestionText } from './AttemptQuestionText';

const IGNORE_INPUT = () => undefined;

interface AttemptAnswerFieldsProps {
  labelledBy: string;
  itemId: string;
  kind: ExamItemKind;
  options: AttemptOptionDto[];
  text?: string;
  selected?: string[];
}

export function AttemptAnswerFields({
  labelledBy,
  itemId,
  kind,
  options,
  text,
  selected,
}: AttemptAnswerFieldsProps) {
  return (
    <>
      {kind === 'text' && (
        <AttemptQuestionText
          labelledBy={labelledBy}
          value={text ?? ''}
          disabled
          onChange={IGNORE_INPUT}
          onBlur={IGNORE_INPUT}
        />
      )}
      {(kind === 'single' || kind === 'multiple') && (
        <AttemptQuestionChoice
          labelledBy={labelledBy}
          itemId={itemId}
          kind={kind}
          options={options}
          selected={selected ?? []}
          disabled
          onChange={IGNORE_INPUT}
        />
      )}
    </>
  );
}
