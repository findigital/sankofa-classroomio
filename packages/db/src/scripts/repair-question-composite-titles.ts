/**
 * Rewrites question.title values that were stored as a Postgres composite row.
 *
 * Dry run is the default. Pass `--execute` to update rows. Running it again
 * changes nothing: a repaired title no longer parses as a question row.
 *
 *   pnpm --filter @cio/db db:repair-question-titles
 *   pnpm --filter @cio/db db:repair-question-titles -- --execute
 */
import 'dotenv/config';

import postgres from 'postgres';
import { questionTitleRepairs } from '../queries/exercise/question-title';

const connectionString = process.env.DATABASE_URL ?? process.env.PRIVATE_DATABASE_URL ?? '';
const shouldExecute = process.argv.includes('--execute');

if (!connectionString) {
  console.error('DATABASE_URL or PRIVATE_DATABASE_URL environment variable is required');
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString, { prepare: false });

  try {
    const candidates = await sql<Array<{ id: number | string; title: string }>>`
      select id, title
      from question
      where title like '(%'
    `;
    const repairs = questionTitleRepairs(candidates.map((row) => ({ id: Number(row.id), title: row.title })));

    console.log(`${repairs.length} question title${repairs.length === 1 ? '' : 's'} stored as a composite row`);
    for (const repair of repairs.slice(0, 20)) {
      console.log(`  ${repair.id}: ${repair.title.slice(0, 120)}`);
    }

    if (!shouldExecute) {
      console.log('Dry run. Re-run with --execute to update these rows.');
      return;
    }

    const repairedAt = new Date().toISOString();
    for (const repair of repairs) {
      await sql`
        update question
        set title = ${repair.title}, updated_at = ${repairedAt}
        where id = ${repair.id}
          and title like '(%'
      `;
    }

    const remaining = questionTitleRepairs(
      (
        await sql<Array<{ id: number | string; title: string }>>`
          select id, title
          from question
          where title like '(%'
        `
      ).map((row) => ({ id: Number(row.id), title: row.title }))
    );

    console.log(`Updated ${repairs.length} question titles. ${remaining.length} composite titles remain.`);
    if (remaining.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('repair-question-composite-titles error:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

main();
