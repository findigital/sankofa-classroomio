import { describe, expect, it } from 'vitest';

import {
  mapQuestionsForGrading,
  questionTitleForStorage,
  questionTitleRepairs,
  readQuestionTitle
} from '@cio/db/queries/exercise/question-title';

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

describe('question title storage and grading', () => {
  it('stores the question text when a write is given a composite row', () => {
    expect(questionTitleForStorage(storedRow)).toBe(ventureConcept);
    expect(questionTitleForStorage(ventureConcept)).toBe(ventureConcept);
  });

  it('returns the question text from grading rows and repairs only composite titles', () => {
    expect(mapQuestionsForGrading([{ id: 4, title: storedRow, points: 10 }])).toEqual([
      { id: 4, title: ventureConcept, points: 10 }
    ]);

    expect(
      questionTitleRepairs([
        { id: 4, title: storedRow },
        { id: 3, title: storedRow },
        { id: 9, title: ventureConcept }
      ])
    ).toEqual([
      { id: 4, title: ventureConcept },
      { id: 3, title: ventureConcept }
    ]);

    const repaired = questionTitleRepairs([{ id: 4, title: storedRow }]);
    expect(questionTitleRepairs(repaired)).toEqual([]);
  });
});
