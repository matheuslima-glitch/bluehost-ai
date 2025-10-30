-- Add funnel_id column to domains table
ALTER TABLE domains ADD COLUMN IF NOT EXISTS funnel_id text;