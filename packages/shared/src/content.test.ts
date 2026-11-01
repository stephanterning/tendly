import { expect, it } from 'vitest';
import { documentSchema, toDocument, plainText } from './content.js';
it('preserves literal legacy text and rejects active content, unsafe links and malformed trees', () => {
  const original = '<script>alert(1)</script>\n& plain text';
  expect(plainText(documentSchema.parse(toDocument(original)))).toBe(original);
  for (const value of [
    { type: 'doc', content: [{ type: 'paragraph', content: { bad: true } }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [null] }] },
    { type: 'doc', content: [{ type: 'html', text: '<script>' }] },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    },
    {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://tracker.test/a.png' } }],
    },
    {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'heading', attrs: { level: 2 } }],
        },
      ],
    },
  ])
    expect(documentSchema.safeParse(value).success).toBe(false);
  let node: unknown = { type: 'paragraph' };
  for (let i = 0; i < 30; i++) node = { type: 'blockquote', content: [node] };
  expect(documentSchema.safeParse({ type: 'doc', content: [node] }).success).toBe(false);
});
it('keeps words intact across inline formatting, headings and explicit line breaks', () => {
  const inline = [
    { type: 'text', text: 'hol' },
    { type: 'text', text: 'iday', marks: [{ type: 'bold' }] },
    { type: 'hardBreak' },
    { type: 'text', text: 'plans' },
  ];
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: inline },
      { type: 'paragraph', content: inline },
    ],
  };
  expect(plainText(documentSchema.parse(doc))).toBe('holiday\nplans\nholiday\nplans');
});
