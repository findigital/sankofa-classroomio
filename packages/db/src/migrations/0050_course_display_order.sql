ALTER TABLE "course" ADD COLUMN IF NOT EXISTS "display_order" integer;

UPDATE "organization"
SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{hideCoursePricing}', 'true'::jsonb, true)
WHERE COALESCE("settings"->>'hideCoursePricing', '') = '';
