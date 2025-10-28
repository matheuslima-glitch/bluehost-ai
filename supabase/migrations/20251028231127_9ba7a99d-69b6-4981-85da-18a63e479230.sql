-- Add platform column to domains table
ALTER TABLE domains ADD COLUMN IF NOT EXISTS platform TEXT;

-- Add comment to document the platform field
COMMENT ON COLUMN domains.platform IS 'Platform type: wordpress or atomicat';