import { describe, expect, it, vi } from 'vitest';
import { ELEMENT_DEFAULTS, type Slide } from '@openmaic/dsl';
import { normalizeImportedSlides, parsedToSlides } from '../src/import-pipeline';

const baseSlide = (elements: unknown[]): Slide =>
  ({
    id: 's1',
    elements,
    background: { type: 'solid', color: '#ffffff' },
    viewportSize: 1280,
    viewportRatio: 0.5625,
  }) as unknown as Slide;

const box = { id: 'e1', left: 10, top: 10, width: 100, height: 50, rotate: 0 };

describe('normalizeImportedSlides', () => {
  it('fills required content fields the transform left off', () => {
    const [slide] = normalizeImportedSlides([
      baseSlide([{ ...box, type: 'text', content: '<p>hi</p>' }]),
    ]);
    const [text] = slide.elements;
    expect(text.type).toBe('text');
    expect(text).toMatchObject({
      defaultFontName: ELEMENT_DEFAULTS.text.defaultFontName,
      defaultColor: ELEMENT_DEFAULTS.text.defaultColor,
    });
  });

  it('passes well-formed elements through untouched', () => {
    const el = {
      ...box,
      type: 'text',
      content: '<p>hi</p>',
      defaultFontName: 'Themed Font',
      defaultColor: '#123456',
    };
    const [slide] = normalizeImportedSlides([baseSlide([el])]);
    expect(slide.elements[0]).toMatchObject({
      defaultFontName: 'Themed Font',
      defaultColor: '#123456',
    });
  });

  it('drops an element normalization cannot repair, keeps the rest, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [slide] = normalizeImportedSlides([
      baseSlide([
        { ...box, type: 'text', content: '<p>ok</p>' },
        { ...box, id: 'e2', type: 'text', defaultColor: 123 },
      ]),
    ]);
    expect(slide.elements).toHaveLength(1);
    expect(slide.elements[0].id).toBe('e1');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropping element'));
    warn.mockRestore();
  });

  it('does not mutate its input', () => {
    const el = { ...box, type: 'text', content: '<p>hi</p>' };
    const input = [baseSlide([el])];
    normalizeImportedSlides(input);
    expect(input[0].elements[0]).toBe(el);
    expect('defaultFontName' in (el as Record<string, unknown>)).toBe(false);
  });
});

describe('parsedToSlides · normalize boundary', () => {
  it('emits slides whose elements satisfy the contract defaults end to end', async () => {
    const json = {
      size: { width: 960, height: 540 },
      themeColors: [],
      slides: [
        {
          fill: { type: 'color', value: '#ffffff' },
          note: '',
          layoutElements: [],
          elements: [
            {
              type: 'text',
              left: 100,
              top: 100,
              width: 400,
              height: 60,
              name: 'title',
              order: 1,
              rotate: 0,
              content: '<div><p><span>hello</span></p></div>',
              fill: { type: 'color', value: 'transparent' },
              borderWidth: 0,
              borderColor: '#000000',
              borderType: 'solid',
              borderStrokeDasharray: '0',
              isVertical: false,
              vAlign: 'up',
            },
          ],
        },
      ],
    };

    const slides = await parsedToSlides(json as unknown as Parameters<typeof parsedToSlides>[0]);
    expect(slides).toHaveLength(1);
    const [text] = slides[0].elements;
    expect(text.type).toBe('text');
    // The transform fills these from the deck theme; the boundary guarantees
    // they are present either way.
    expect(text).toHaveProperty('defaultFontName');
    expect(text).toHaveProperty('defaultColor');
  });
});
