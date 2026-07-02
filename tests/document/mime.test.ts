import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_MIME_TYPES,
  isMimeSupportedByProviders,
  normalizeDocumentMimeType,
} from '@/lib/document/mime';

describe('document MIME normalization', () => {
  it('uses Office filename extensions when browsers report generic ZIP MIME types', () => {
    expect(
      normalizeDocumentMimeType({
        mimeType: 'application/zip',
        fileName: 'lesson.docx',
      }),
    ).toBe(DOCUMENT_MIME_TYPES.docx);

    expect(
      normalizeDocumentMimeType({
        mimeType: 'application/x-zip-compressed',
        fileName: 'slides.pptx',
      }),
    ).toBe(DOCUMENT_MIME_TYPES.pptx);
  });

  it('keeps specific MIME types when they are not generic upload fallbacks', () => {
    expect(
      normalizeDocumentMimeType({
        mimeType: 'text/plain',
        fileName: 'lesson.docx',
      }),
    ).toBe(DOCUMENT_MIME_TYPES.txt);
  });

  it('maps aliased MIMEs to the canonical form', () => {
    // Some browsers report image/jpeg2000 for .jp2, image/x-ms-bmp for .bmp,
    // text/x-markdown for .md — these must round-trip to the canonical MIME
    // so provider whitelists and downstream lookups all agree.
    expect(
      normalizeDocumentMimeType({ mimeType: 'image/jpeg2000', fileName: 'photo.jp2' }),
    ).toBe(DOCUMENT_MIME_TYPES.jp2);
    expect(
      normalizeDocumentMimeType({ mimeType: 'image/x-ms-bmp', fileName: 'chart.bmp' }),
    ).toBe(DOCUMENT_MIME_TYPES.bmp);
    expect(
      normalizeDocumentMimeType({ mimeType: 'text/x-markdown', fileName: 'notes.md' }),
    ).toBe(DOCUMENT_MIME_TYPES.markdown);
  });

  it('falls back to the extension when a browser reports an unknown MIME', () => {
    // Some Windows setups report application/x-msword for .doc — unknown to
    // the format registry, but the extension resolves cleanly.
    expect(
      normalizeDocumentMimeType({ mimeType: 'application/x-msword', fileName: 'legacy.doc' }),
    ).toBe(DOCUMENT_MIME_TYPES.doc);
  });

  it('accepts a non-canonical browser MIME for a provider that supports the format', () => {
    // Regression: previously the raw non-canonical MIME leaked through and
    // failed the provider whitelist despite the file being valid.
    expect(
      isMimeSupportedByProviders(
        { mimeType: 'image/jpeg2000', fileName: 'photo.jp2' },
        ['mineru-cloud'],
      ),
    ).toBe(true);
  });
});
