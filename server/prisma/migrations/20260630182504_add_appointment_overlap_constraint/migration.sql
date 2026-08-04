CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointment"
ADD CONSTRAINT appointment_overlap_constraint
EXCLUDE USING GIST (
    professional_id WITH =,
    tsrange(start_time, end_time) WITH &&
) WHERE (status <> 'CANCELLED');
