import { describe, expect, it } from 'vitest';

import { legacyLessonNoteToRender, preferStoredLessonNote } from '../src/functions/lesson-note';

describe('preferStoredLessonNote', () => {
  it('keeps note-block HTML when a note block has content', () => {
    expect(preferStoredLessonNote('<p>From the block</p>', '<p>From the column</p>')).toBe('<p>From the block</p>');
  });

  it('falls back to the lesson note column when blocks have no note', () => {
    expect(preferStoredLessonNote(null, '<p>Legacy note</p>')).toBe('<p>Legacy note</p>');
    expect(preferStoredLessonNote('   ', '<p>Legacy note</p>')).toBe('<p>Legacy note</p>');
  });

  it('returns null when neither source has content', () => {
    expect(preferStoredLessonNote(null, '  ')).toBeNull();
  });
});

describe('legacyLessonNoteToRender', () => {
  it('returns the note when there are no blocks', () => {
    expect(legacyLessonNoteToRender('<p>Hello</p>', [])).toBe('<p>Hello</p>');
  });

  it('returns the note ahead of non-note blocks', () => {
    expect(legacyLessonNoteToRender('<p>Hello</p>', [{ type: 'video', content: '' }])).toBe('<p>Hello</p>');
  });

  it('returns empty when a note block already has the content', () => {
    expect(
      legacyLessonNoteToRender('<p>Hello</p>', [
        { type: 'note', content: '<p>Hello</p>' },
        { type: 'video', content: '' }
      ])
    ).toBe('');
  });

  it('returns empty for a blank note', () => {
    expect(legacyLessonNoteToRender('<p>   </p>', [])).not.toBe('');
    expect(legacyLessonNoteToRender('   ', [])).toBe('');
    expect(legacyLessonNoteToRender(null, [])).toBe('');
  });
});
