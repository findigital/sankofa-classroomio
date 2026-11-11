function hasVisibleText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Keeps note-block HTML when it has content, otherwise the lesson `note` column.
 */
export function preferStoredLessonNote(
  derivedNote: string | null | undefined,
  storedNote: string | null | undefined
): string | null {
  if (hasVisibleText(derivedNote)) return derivedNote.trim();
  if (hasVisibleText(storedNote)) return storedNote.trim();

  return null;
}

/**
 * HTML to show ahead of lesson blocks. Empty when a note block already has content.
 */
export function legacyLessonNoteToRender(
  note: string | null | undefined,
  blocks: Array<{ type: string; content?: string | null }>
): string {
  const noteBlockHasContent = blocks.some((block) => block.type === 'note' && hasVisibleText(block.content));
  if (noteBlockHasContent) return '';
  if (!hasVisibleText(note)) return '';

  return note.trim();
}
