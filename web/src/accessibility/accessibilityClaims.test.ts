// Утверждения страницы «Доступность» сверены с кодом (ADR-0158, CLAUDE.md
// правило 1д). Заявление, в котором написано «есть рамка фокуса», а рамку
// потом убрали, хуже отсутствующего: это ложное заявление на видном месте
// сайта. Раньше такое расхождение ловил бы только человек с памятью, поэтому
// каждое утверждение текста здесь проверяется по файлу, который его держит:
// index.css (фокус, движение, кегль полей, цвета), index.html (язык, масштаб),
// eslint.config.mjs (проверка разметки). Убрал или поменял — тест краснеет,
// пока не поправят текст вслед за кодом. Так же privacyPolicyText.test.ts
// держит сроки хранения.
//
// Файлы читаются через `node:fs`, а не `?raw`: vitest подменяет любой CSS
// пустой строкой, в том числе с `?raw`, и тест молча проверял бы пустоту. web
// собирается с types: ['vite/client'] без типов Node — поэтому ссылка ниже,
// только для этого файла.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AA_TEXT_CONTRAST,
  INK_FAINT_CONTRAST,
  INK_SOFT_ON_PANEL_CONTRAST,
} from './accessibilityText';

const here = dirname(fileURLToPath(import.meta.url));

function readRepoFile(relativeToTest: string): string {
  const text = readFileSync(resolve(here, relativeToTest), 'utf8');
  // Пустой файл сделал бы каждое «не найдено» ложным успехом.
  if (!text) throw new Error(`Файл ${relativeToTest} пуст или не прочитан`);
  return text;
}

const indexCss = readRepoFile('../index.css');
const indexHtml = readRepoFile('../../index.html');
const eslintConfig = readRepoFile('../../../eslint.config.mjs');

function toNumber(ruDecimal: string): number {
  return Number(ruDecimal.replace(',', '.'));
}

function toRu(ratio: number): string {
  return ratio.toFixed(1).replace('.', ',');
}

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(indexCss);
  if (!match?.[1]) throw new Error(`В index.css нет цветового токена --${name}`);
  return match[1];
}

// WCAG 2.0, определение относительной яркости и контраста.
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [lighter = 0, darker = 0] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe('«Что сделано» — клавиатура и фокус', () => {
  it('у любого элемента с клавиатурным фокусом есть видимая рамка 3px', () => {
    expect(indexCss).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--focus\)/,
    );
  });

  it('рамка фокуса отличима от фона (WCAG 1.4.11, не ниже 3:1)', () => {
    for (const background of ['paper', 'card', 'panel']) {
      expect(contrast(token('focus'), token(background))).toBeGreaterThanOrEqual(3);
    }
  });

  it('ссылка «Перейти к содержимому» прячется вне фокуса и показывается на нём', () => {
    expect(indexCss).toMatch(/\.xuanxue-skip-link\s*\{[^}]*translateY\(-200%\)/);
    expect(indexCss).toMatch(/\.xuanxue-skip-link:focus\s*\{[^}]*transform:\s*none/);
  });
});

describe('«Что сделано» — цвета', () => {
  // Текст страницы говорит «не ниже 4,5:1». Считаем по токенам index.css для
  // пар «цвет текста — фон страницы и карточки», которыми набран основной
  // текст кабинета.
  it('текст на бумаге и карточке — не ниже нормы AA', () => {
    const minimum = toNumber(AA_TEXT_CONTRAST);
    for (const text of ['ink', 'ink-soft', 'terracotta-text', 'danger', 'jade']) {
      for (const background of ['paper', 'card']) {
        expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(minimum);
      }
    }
  });

  it('рамка поля и кнопки отличима от бумаги (не ниже 3:1)', () => {
    expect(contrast(token('control-border'), token('paper'))).toBeGreaterThanOrEqual(3);
  });
});

describe('«Что пока не получается» — цвета: числа в тексте верны', () => {
  // Если кто-то темнит подсказки до AA, ограничение исчезает — и тест
  // заставляет убрать его из заявления, а не оставить как устаревшее.
  it('--ink-faint на бумаге читается с контрастом из текста и ниже AA', () => {
    const ratio = contrast(token('ink-faint'), token('paper'));

    expect(toRu(ratio)).toBe(INK_FAINT_CONTRAST);
    expect(ratio).toBeLessThan(toNumber(AA_TEXT_CONTRAST));
  });

  it('--ink-soft на подложке --panel читается с контрастом из текста и ниже AA', () => {
    const ratio = contrast(token('ink-soft'), token('panel'));

    expect(toRu(ratio)).toBe(INK_SOFT_ON_PANEL_CONTRAST);
    expect(ratio).toBeLessThan(toNumber(AA_TEXT_CONTRAST));
  });
});

describe('«Что сделано» — движение, поля, масштаб, язык', () => {
  it('prefers-reduced-motion гасит анимации и переходы', () => {
    expect(indexCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*animation-duration[^}]*transition-duration/,
    );
  });

  it('кегль полей ввода — не меньше 16px', () => {
    const match = /input,\s*textarea,\s*select\s*\{[^}]*font-size:\s*(\d+)px/.exec(
      indexCss,
    );

    expect(Number(match?.[1])).toBeGreaterThanOrEqual(16);
  });

  it('язык страницы указан — русский', () => {
    expect(indexHtml).toMatch(/<html[^>]*\blang="ru"/);
  });

  it('масштаб страницы не заблокирован', () => {
    const viewport = /<meta\s+name="viewport"[^>]*>/.exec(indexHtml)?.[0] ?? '';

    expect(viewport).not.toBe('');
    expect(viewport).not.toMatch(/maximum-scale|user-scalable/);
  });
});

describe('«Что сделано» — автоматическая проверка разметки', () => {
  it('eslint-plugin-jsx-a11y подключён к web с рекомендованными правилами', () => {
    expect(eslintConfig).toContain("from 'eslint-plugin-jsx-a11y'");
    expect(eslintConfig).toContain('jsxA11y.configs.recommended.rules');
  });
});
