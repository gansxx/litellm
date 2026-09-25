BEGIN;

DROP VIEW IF EXISTS public."DailyTagSpend";
DROP VIEW IF EXISTS public."Last30dKeysBySpend";
DROP VIEW IF EXISTS public."Last30dModelsBySpend";
DROP VIEW IF EXISTS public."Last30dTopEndUsersSpend";
DROP VIEW IF EXISTS public."LiteLLM_VerificationTokenView";
DROP VIEW IF EXISTS public."MonthlyGlobalSpend";
DROP VIEW IF EXISTS public."MonthlyGlobalSpendPerKey";
DROP VIEW IF EXISTS public."MonthlyGlobalSpendPerUserPerKey";

DO $$
DECLARE
    table_name text;
BEGIN
    FOR table_name IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname ~ '^LiteLLM_'
    LOOP
        EXECUTE format('DROP TABLE public.%I CASCADE', table_name);
    END LOOP;
END $$;

DROP TYPE IF EXISTS public."JobStatus";
DROP TABLE IF EXISTS public._prisma_migrations;

COMMIT;
