'use client';

import { useLayoutEffect, type RefObject } from 'react';
import katex from 'katex';
import renderMathInElement from 'katex/contrib/auto-render';

const MATH_DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false },
] as const;

export function useAutoRenderMath(
  ref: RefObject<HTMLElement | null>,
  dependency: unknown,
): void {
  useLayoutEffect(() => {
    if (!ref.current) return;
    renderMathInElement(ref.current, {
      delimiters: MATH_DELIMITERS,
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
      ignoredClasses: ['katex'],
      output: 'html',
      strict: false,
      throwOnError: true,
      errorCallback: () => {},
    });
  }, [ref, dependency]);
}

export function renderLatexElementHtml(source?: string): string | null {
  if (!source) return null;
  const { latex, displayMode } = stripMathDelimiters(source);
  if (!latex) return null;

  try {
    return katex.renderToString(escapeLiteralPercents(latex), {
      displayMode,
      output: 'html',
      strict: false,
      throwOnError: false,
    });
  } catch {
    return null;
  }
}

function stripMathDelimiters(source: string): { latex: string; displayMode: boolean } {
  const text = source.trim();
  if (text.startsWith('$$') && text.endsWith('$$') && text.length >= 4) {
    return { latex: text.slice(2, -2).trim(), displayMode: true };
  }
  if (text.startsWith('\\[') && text.endsWith('\\]') && text.length >= 4) {
    return { latex: text.slice(2, -2).trim(), displayMode: true };
  }
  if (text.startsWith('\\(') && text.endsWith('\\)') && text.length >= 4) {
    return { latex: text.slice(2, -2).trim(), displayMode: false };
  }
  if (text.startsWith('$') && text.endsWith('$') && text.length >= 2) {
    return { latex: text.slice(1, -1).trim(), displayMode: false };
  }
  return { latex: text, displayMode: true };
}

function escapeLiteralPercents(value: string): string {
  let escaped = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '%') {
      escaped += value[index];
      continue;
    }
    escaped += index > 0 && value[index - 1] === '\\' ? '%' : '\\%';
  }
  return escaped;
}
