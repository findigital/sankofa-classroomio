/**
 * Postgres renders a question row as `(id,type,"title",...)` when a select returns the composite.
 * A stored or mis-read title in that shape is reduced to the quoted question text.
 */
export function readQuestionTitle(value: unknown): string {
  if (typeof value !== 'string') return '';

  const fields = parsePostgresComposite(value);
  if (!fields || fields.length < 6) return value;
  if (!/^\d+$/.test(fields[0] ?? '') || !/^\d+$/.test(fields[1] ?? '')) return value;

  const title = fields[2];
  if (!title) return value;

  return title;
}

/** Title persisted on insert or update. A composite row is stored as its question text. */
export function questionTitleForStorage(value: unknown): string {
  return readQuestionTitle(value);
}

export function mapQuestionsForGrading<T extends { title: unknown }>(
  questions: T[]
): Array<Omit<T, 'title'> & { title: string }> {
  return questions.map((question) => ({
    ...question,
    title: readQuestionTitle(question.title)
  }));
}

/** Rows whose stored title is a composite, and the title that should replace it. Idempotent. */
export function questionTitleRepairs(rows: Array<{ id: number; title: string }>): Array<{ id: number; title: string }> {
  return rows.flatMap((row) => {
    const title = readQuestionTitle(row.title);
    if (!title || title === row.title) return [];

    return [{ id: row.id, title }];
  });
}

export function parsePostgresComposite(value: string): string[] | null {
  if (value.length < 2 || value[0] !== '(' || value[value.length - 1] !== ')') return null;

  const body = value.slice(1, -1);
  const fields: string[] = [];
  let index = 0;

  while (index <= body.length) {
    if (index === body.length) {
      fields.push('');
      break;
    }

    if (body[index] === '"') {
      let field = '';
      index += 1;
      let closed = false;

      while (index < body.length) {
        const character = body[index];
        if (character === '"') {
          if (body[index + 1] === '"') {
            field += '"';
            index += 2;
            continue;
          }

          index += 1;
          closed = true;
          break;
        }

        if (character === '\\' && index + 1 < body.length) {
          field += body[index + 1];
          index += 2;
          continue;
        }

        field += character;
        index += 1;
      }

      if (!closed) return null;
      fields.push(field);
    } else {
      const commaIndex = body.indexOf(',', index);
      if (commaIndex === -1) {
        fields.push(body.slice(index));
        break;
      }

      fields.push(body.slice(index, commaIndex));
      index = commaIndex;
    }

    if (index >= body.length) break;
    if (body[index] !== ',') return null;

    index += 1;
    if (index === body.length) {
      fields.push('');
      break;
    }
  }

  return fields;
}
