// Два типографских приёма формулировки в одном компоненте — ссылки
// (ADR-0093) и акценты `**жирным**` (textAccents.ts) — а не два похожих
// компонента: CLAUDE.md «Одна механика — один компонент» велит один
// переиспользуемый узел на один приём разметки текста, иначе вторая
// реализация «текст с чем-то внутри» рано или поздно ловится jscpd. Учитель
// вставляет адрес видео и звёздочки в одну и ту же строку — формулировку
// вопроса или подсказку; этот компонент раскладывает её по <a> и <strong>.
// Разбор строк — promptLinks.ts и textAccents.ts (чистые функции, свои
// юнит-тесты, CLAUDE.md «Тесты»); этот компонент только раскладывает
// результат по DOM.
//
// Ни dangerouslySetInnerHTML, ни разбор Markdown здесь не нужны: React
// экранирует текст сам, а ссылкой становится только распознанный
// http(s)-адрес — та же причина, что у CSP (SECURITY.md §7).
//
// Акцент разбирается внутри каждого НЕ-ссылочного куска отдельно, а не по
// всей строке разом: маркер `**` внутри самого адреса (в query-строке
// встречается) не должен ломать ссылку, и наоборот — ссылку внутри акцента
// не разбираем, порядок в строке «сперва ссылка, потом акцент» держит это
// само. Раз формулировка и текст-подсказка учителя идут через один и тот же
// компонент (ScreenHeader.tsx), маркер `**` работает в обоих местах без
// отдельной правки на каждый экран.
import { Fragment } from 'react';
import { textLinkStyle } from './screenLayout';
import { splitPromptLinks } from './promptLinks';
import { splitTextAccents } from './textAccents';

interface RichTextProps {
  text: string;
}

export function RichText({ text }: RichTextProps) {
  return (
    <>
      {splitPromptLinks(text).map((part, index) =>
        part.href ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            style={textLinkStyle}
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={index}>
            {splitTextAccents(part.text).map((accentPart, accentIndex) =>
              accentPart.accent ? (
                <strong key={accentIndex}>{accentPart.text}</strong>
              ) : (
                <Fragment key={accentIndex}>{accentPart.text}</Fragment>
              ),
            )}
          </Fragment>
        ),
      )}
    </>
  );
}
