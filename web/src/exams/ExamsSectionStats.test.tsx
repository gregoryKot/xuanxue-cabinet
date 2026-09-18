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

describe('ExamsSectionStats — плашка «ждут проверки»', () => {
  it('число ещё не пришло — общий текст, без цифры', () => {
    renderStats(null, null);

    expect(
      screen.getByText('Сданные работы, которые ждут вашей оценки.'),
    ).toBeInTheDocument();
  });

  it('очередь пуста — честный текст, не «0»', () => {
    renderStats(0, null);

    expect(screen.getByText('Пока нечего проверять.')).toBeInTheDocument();
  });

  it('есть работы — число внутри одной фразы, без отдельной подписи рядом', () => {
    renderStats(3, null);

    expect(screen.getByText('3 работы ждут проверки.')).toBeInTheDocument();
    expect(screen.queryByText('работы учеников')).not.toBeInTheDocument();
  });

  it('заготовок комментариев ещё нет — приписка честная, не «0»', () => {
    renderStats(null, null, null, 0);

    expect(
      screen.getByText('Пока нет заготовок — добавьте первую на карточке проверки.'),
    ).toBeInTheDocument();
  });

  it('заготовки есть — число в приписке под фразой очереди', () => {
    renderStats(null, null, null, 4);

    expect(screen.getByText('4 заготовки для комментария.')).toBeInTheDocument();
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

describe('ExamsSectionStats — карточка «Проверка»', () => {
  it('ведёт на /grading', () => {
    renderStats(null, null);

    expect(screen.getByText('Проверка').closest('a')).toHaveAttribute('href', '/grading');
  });

  it('приписка общая, не дублирует фразу тёплой плашки очереди', () => {
    renderStats(null, null);

    const plaque = screen.getByText('Сданные работы, которые ждут вашей оценки.');
    const link = screen.getByText('Проверка').closest('a');
    expect(link).not.toContainElement(plaque);
    expect(link).toHaveTextContent(
      'Работы, которые ученики уже сдали. Откройте любую, чтобы поставить итог и написать комментарий.',
    );
  });
});
