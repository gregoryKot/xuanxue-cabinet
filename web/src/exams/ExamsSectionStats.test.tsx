import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ExamsSectionStats } from './ExamsSectionStats';

function renderStats(
  queueCount: number | null,
  strugglingCount: number | null,
  imagesSummary: string | null = null,
  presetsCount: number | null = null,
) {
  return render(
    <MemoryRouter>
      <ExamsSectionStats
        queueCount={queueCount}
        strugglingCount={strugglingCount}
        imagesSummary={imagesSummary}
        presetsCount={presetsCount}
      />
    </MemoryRouter>,
  );
}

describe('ExamsSectionStats — рубрика раздела', () => {
  it('«Ещё в разделе» подписывает блок карточек-переходов (нарекание владельца: карточки шли без заголовка)', () => {
    renderStats(null, null);

    expect(screen.getByRole('heading', { name: 'Ещё в разделе' })).toBeInTheDocument();
  });
});

describe('ExamsSectionStats — карточка «Проверка»: число очереди внутри неё', () => {
  it('число ещё не пришло — крупной строки нет, карточка всё равно ведёт на /grading', () => {
    renderStats(null, null);

    expect(
      screen.queryByText('Сданные работы, которые ждут вашей оценки.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Проверка').closest('a')).toHaveAttribute('href', '/grading');
  });

  it('очередь пуста — честный текст «Пока нечего проверять.», не «0»', () => {
    renderStats(0, null);

    expect(screen.getByText('Пока нечего проверять.').closest('a')).toHaveAttribute(
      'href',
      '/grading',
    );
  });

  it('есть работы — число лежит внутри ссылки на /grading (нарекание владельца: число было некликабельно)', () => {
    renderStats(3, null);

    expect(screen.getByText('3 работы ждут проверки.').closest('a')).toHaveAttribute(
      'href',
      '/grading',
    );
  });
});

describe('ExamsSectionStats — карточка «Проверка»: приписка про заготовки', () => {
  it('заготовок комментариев ещё нет — приписка честная, не «0»', () => {
    renderStats(null, null, null, 0);

    const link = screen.getByText('Проверка').closest('a');
    expect(link).toHaveTextContent(
      'Пока нет заготовок — добавьте первую на карточке проверки.',
    );
  });

  it('заготовки есть — приписка строится formatGradingPresetsHint, а не текстом про очередь', () => {
    renderStats(null, null, null, 4);

    const link = screen.getByText('Проверка').closest('a');
    expect(link).toHaveTextContent('4 заготовки для комментария.');
  });
});

describe('ExamsSectionStats — карточка «Вопросы»', () => {
  it('ведёт на /exam-items', () => {
    renderStats(null, 0);

    expect(screen.getByText('Вопросы').closest('a')).toHaveAttribute(
      'href',
      '/exam-items',
    );
  });

  it('без спотыкающихся вопросов — только объяснение раздела', () => {
    renderStats(null, 0);

    expect(
      screen.getByText(
        'Из них собирается экзамен — один вопрос можно поставить в несколько экзаменов.',
      ),
    ).toBeInTheDocument();
  });

  it('есть спотыкающиеся вопросы — число дописано к тексту', () => {
    renderStats(null, 2);

    expect(
      screen.getByText(/2 вопроса путают больше половины ответивших\./),
    ).toBeInTheDocument();
  });

  it('imagesSummary — null (чистая база, загрузка или сбой) — строки нет', () => {
    renderStats(null, 0, null);

    expect(screen.queryByText(/Картинок к вопросам/)).not.toBeInTheDocument();
  });

  it('imagesSummary есть — дописан второй фразой в ту же приписку', () => {
    renderStats(null, 0, 'Картинок к вопросам: 12 — 3,4 МБ');

    expect(
      screen.getByText(
        'Из них собирается экзамен — один вопрос можно поставить в несколько экзаменов. ' +
          'Картинок к вопросам: 12 — 3,4 МБ',
      ),
    ).toBeInTheDocument();
  });
});
