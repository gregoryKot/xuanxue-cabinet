// Разбор текста пользователю в исходниках TypeScript/TSX для
// check-text-accents.mjs (сам гейт — обход дерева, бейслайн и отчёт —
// остаётся там; здесь только чистый разбор одного файла).
//
// Разбор — через компилятор TypeScript (`import ts from 'typescript'`), не
// регулярками: текст пользователю живёт в строковых литералах, в шаблонах, в
// склейке через `+` и в JSX-тексте, который может тянуться через несколько
// строк и переносов — регэксп по строкам файла такое не соберёт в одну
// единицу.
//
// Экспортирует чистые функции без обращения к fs (collectTextUnits,
// isFlatParagraph, findStrayMarks, findForbiddenMarks) — гоняются на
// строках-фикстурах в check-text-accents.test.mjs, а не на сегодняшнем
// дереве репозитория.
import ts from 'typescript';

// Порог «плоского абзаца»: короче — это строка-подпись (кнопка, лейбл), ей
// акцент не нужен; длиннее — абзац, и в нём обязан быть выделен факт (число,
// срок, имя, что произойдёт), а не наречие.
export const FLAT_PARAGRAPH_MIN_LENGTH = 80;

// Единицу считаем текстом пользователю, если в ней 4+ кириллических буквы
// подряд (отсекает названия классов, CSS-значения, английские константы) и
// есть хотя бы один пробел (отсекает однословные технические строки).
const CYRILLIC_RUN_RE = /[А-Яа-яЁё]{4}/;

/** true — единица похожа на текст, который видит пользователь (а не на
 * техническую строку вроде имени CSS-класса или английской константы). */
function isUserFacingText(text) {
  return CYRILLIC_RUN_RE.test(text) && /\s/.test(text);
}

/** Текст `TemplateExpression` (шаблон с подстановкой `${…}`): голова плюс
 * хвосты после каждой подстановки, сама подстановка схлопывается в «…» —
 * её значение неизвестно на этапе разбора, но само место в тексте нужно
 * сохранить, иначе «через ${days} дней» и «через дней» — разная длина. */
function templateExpressionText(node) {
  let text = node.head.text;
  for (const span of node.templateSpans) {
    text += `…${span.literal.text}`;
  }
  return text;
}

/** Текст склейки строк через `+`, если все её части — литералы: длинный
 * абзац в кабинете почти всегда записан именно так (prettier переносит
 * строку, автор дописывает `+`), и по кускам он ни разу не дотягивает до
 * порога — гейт без этой склейки не видел бы как раз самые длинные тексты.
 * `null` — в склейке есть что-то, кроме литералов (переменная, вызов): такую
 * единицу собрать нечем, части учитываются по отдельности. */
function concatenatedText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) return templateExpressionText(node);
  if (ts.isParenthesizedExpression(node)) return concatenatedText(node.expression);
  if (!ts.isBinaryExpression(node)) return null;
  if (node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return null;
  const left = concatenatedText(node.left);
  if (left === null) return null;
  const right = concatenatedText(node.right);
  return right === null ? null : left + right;
}

/** Текстовые единицы файла `fileName` (путь только определяет `.tsx`/`.ts`
 * для разбора JSX) — строковые литералы, шаблоны без подстановки, шаблоны с
 * подстановкой, склейка литералов через `+` и JSX-текст, отфильтрованные
 * isUserFacingText. JSX-текст, растянутый на несколько строк/отступов — один
 * узел `ts.JsxText`, пробелы в нём схлопываются в один и обрезаются по
 * краям. */
export function collectTextUnits(fileName, source) {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const units = [];

  function addUnit(node, text) {
    if (!isUserFacingText(text)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    units.push({ file: fileName, line: line + 1, text });
  }

  function visit(node) {
    // Склейка литералов через `+` — одна единица целиком, и внутрь не
    // спускаемся: иначе тот же текст посчитался бы ещё и по кускам.
    if (ts.isBinaryExpression(node)) {
      const joined = concatenatedText(node);
      if (joined !== null) {
        addUnit(node, joined);
        return;
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      addUnit(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      addUnit(node, templateExpressionText(node));
    } else if (ts.isJsxText(node)) {
      const collapsed = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
      if (collapsed) addUnit(node, collapsed);
    }
    // Общий проход в конце, а не в ветках выше: у шаблона с подстановкой
    // нужно спуститься в выражения `${…}` (там может быть вложенный JSX или
    // строка), а у строкового литерала и JSX-текста детей нет — проход
    // просто ничего не находит.
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return units;
}

/** true — единица «плоская»: длиннее порога и без единого акцента `**`. */
export function isFlatParagraph(unit) {
  return unit.text.length >= FLAT_PARAGRAPH_MIN_LENGTH && !unit.text.includes('**');
}

/** Число вхождений `**` в тексте, без пересечений (`split` считает границы
 * между кусками ровно так же, как их считал бы человек, ищущий пары). */
function markCount(text) {
  return text.split('**').length - 1;
}

/** Единицы с непарным маркером: нечётное число `**` — часть выделения
 * осталась бы на экране звёздочками вместо жирного текста. */
export function findStrayMarks(units) {
  return units.filter((u) => markCount(u.text) % 2 === 1);
}

/** Единицы, где маркер `**` вообще есть — используется для api/src и
 * shared/src, где акцентов быть не должно (текст уходит в Telegram простым
 * текстом). */
export function findForbiddenMarks(units) {
  return units.filter((u) => u.text.includes('**'));
}
