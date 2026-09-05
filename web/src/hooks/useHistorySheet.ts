import { useEffect, useId, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Регистрирует запись истории через react-router при монтировании
 * fullscreen-листа (CLAUDE.md: любой `position: fixed, inset: 0` — сюда),
 * чтобы кнопка «Назад» в браузере закрывала лист, а не уводила из кабинета.
 *
 * Только `useNavigate`/`useLocation` — прямой `history.pushState` конфликтует
 * с React Router: при «Назад» срабатывают оба обработчика одновременно, и
 * лист закрывается, и роутер уходит на предыдущий раздел.
 *
 * Возвращает `goBack()` — её обязаны вызывать все кнопки «Назад»/«Закрыть»
 * внутри листа, а не `onClose` напрямую.
 */
export function useHistorySheet(onClose: () => void) {
  const navigate = useNavigate();
  const location = useLocation();
  const ref = useRef(onClose);
  // ref.current читается только из пост-коммит эффекта ниже, обновлять его в
  // рендере не нужно.
  useEffect(() => {
    ref.current = onClose;
  });
  // useId вместо Date.now/Math.random в рендере — стабильный уникальный ID,
  // чтобы вложенные листы не путали свои записи истории.
  const id = useId();
  const ready = useRef(false);

  useEffect(() => {
    const prevState = (location.state as Record<string, unknown> | null) ?? {};
    void navigate(location.pathname + location.search + location.hash, {
      replace: false,
      state: { ...prevState, __sheetId: id },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- пушим запись истории только при монтировании, а не на каждое изменение location
  }, []);

  useEffect(() => {
    if (!ready.current) {
      // Ждём, пока наш navigate выше не закоммитится.
      if ((location.state as { __sheetId?: string } | null)?.__sheetId === id)
        ready.current = true;
      return;
    }
    // Нашей записи больше нет в истории (юзер нажал «Назад») — закрываем лист.
    if ((location.state as { __sheetId?: string } | null)?.__sheetId !== id) {
      ref.current();
    }
  }, [location, id]);

  return () => {
    void navigate(-1);
  };
}
