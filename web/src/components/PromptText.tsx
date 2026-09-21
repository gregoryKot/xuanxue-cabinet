// Кликабельные ссылки в тексте вопроса (ADR-0093) — учитель вставляет адрес
// видео прямо в формулировку вместо отдельного поля, а кабинет сам находит
// адрес и показывает его ссылкой. Разбор строки — promptLinks.ts (чистая
// функция, свой юнит-тест, CLAUDE.md «Тесты»); этот компонент только
// раскладывает результат по <a> и тексту.
//
// Ни dangerouslySetInnerHTML, ни разбор Markdown здесь не нужны: React
// экранирует текст сам, а ссылкой становится только распознанный
// http(s)-адрес — та же причина, что у CSP (SECURITY.md §7).
import { Fragment } from 'react';
import { textLinkStyle } from './screenLayout';
import { splitPromptLinks } from './promptLinks';

interface PromptTextProps {
  text: string;
}

export function PromptText({ text }: PromptTextProps) {
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
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
