// Проверки LessonMaterialRow на материал без ссылки (ADR-0134) — отдельным
// файлом, не в LessonMaterialsSection.test.tsx: тот уже 357 строк, а
// check-file-size-ratchet.mjs выше 150 не даёт файлу расти дальше
// (CLAUDE.md «файл до 150 строк растёт свободно; выше — только уменьшается»).
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MaterialDto } from '@xuanxue/shared';
import { LessonMaterialRow } from './LessonMaterialRow';

function makeMaterial(overrides: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    title: 'Форма 24, разбор',
    kind: 'document',
    classIds: [],
    lessonIds: [],
    access: 'all',
    tags: [],
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('LessonMaterialRow — материал без ссылки (ADR-0134)', () => {
  it('название — обычный текст, не ссылка; подпись и кнопка действия на месте', () => {
    render(
      <LessonMaterialRow
        material={makeMaterial()}
        actionLabel="Убрать"
        onAction={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('link', { name: 'Форма 24, разбор' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Форма 24, разбор')).toBeInTheDocument();
    expect(screen.getByText('Документ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Убрать' })).toBeInTheDocument();
  });

  it('без ссылки плеера нет, даже у материала-видео', () => {
    render(
      <LessonMaterialRow
        material={makeMaterial({ kind: 'video' })}
        actionLabel="Убрать"
        onAction={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Смотреть здесь' }),
    ).not.toBeInTheDocument();
  });
});

describe('LessonMaterialRow — материал со ссылкой', () => {
  it('название — ссылка на адрес материала, открывается в новой вкладке', () => {
    render(
      <LessonMaterialRow
        material={makeMaterial({ url: 'https://example.com/article' })}
        actionLabel="Убрать"
        onAction={vi.fn()}
      />,
    );

    const link = screen.getByRole('link', { name: 'Форма 24, разбор' });
    expect(link).toHaveAttribute('href', 'https://example.com/article');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('ссылка на встраиваемое видео — плеер рисуется рядом с названием', () => {
    render(
      <LessonMaterialRow
        material={makeMaterial({
          kind: 'video',
          url: 'https://youtu.be/dQw4w9WgXcQ',
        })}
        actionLabel="Убрать"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Смотреть здесь' })).toBeInTheDocument();
  });
});
