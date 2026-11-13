import { describe, expect, it } from 'vitest';

import { readQuestionTitle } from '@cio/db/queries/exercise/question-title';

const ventureConcept =
  'Write a 3-paragraph venture concept: (1) the problem you are solving, (2) who you are solving it for, and (3) your preliminary solution. Then briefly restate your refined Problem–Opportunity card (problem, who is affected, current inadequate solutions, and one sentence on your proposed venture).';

const storedRow = `(2,3,"${ventureConcept}","2026-11-10 18:55:42.540646+00","2026-11-10 18:55:42.540646+00",fa7dea7f-d40d-4cd6-9f6c-0421c64ec112,,9cdb6282-309f-4db7-b123-4b04c02de19c,19,10,{},0)`;

describe('readQuestionTitle', () => {
  it('renders the question text instead of a Postgres question row', () => {
    expect(readQuestionTitle(storedRow)).toBe(ventureConcept);
  });

  it('keeps a normal title, including one that mentions parentheses', () => {
    expect(readQuestionTitle(ventureConcept)).toBe(ventureConcept);
    expect(readQuestionTitle('(1) the problem you are solving')).toBe('(1) the problem you are solving');
  });

  it('unescapes quotes inside a stored question row', () => {
    const row = `(2,3,"Say ""hi"" now","2026-11-10 18:55:42.540646+00","2026-11-10 18:55:42.540646+00",fa7dea7f-d40d-4cd6-9f6c-0421c64ec112,,9cdb6282-309f-4db7-b123-4b04c02de19c,1,{},0)`;

    expect(readQuestionTitle(row)).toBe('Say "hi" now');
  });
});
