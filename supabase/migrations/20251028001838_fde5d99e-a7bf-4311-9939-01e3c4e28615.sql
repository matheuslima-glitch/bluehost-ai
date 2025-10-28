-- Add new columns to domains table for tracking purchase and configuration details
ALTER TABLE public.domains 
ADD COLUMN IF NOT EXISTS purchase_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS purchase_price numeric(10,2),
ADD COLUMN IF NOT EXISTS structure_type text CHECK (structure_type IN ('wordpress', 'atomicat')),
ADD COLUMN IF NOT EXISTS traffic_source text,
ADD COLUMN IF NOT EXISTS zone_id text,
ADD COLUMN IF NOT EXISTS propagation_ends_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS ssl_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS dns_configured boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS purchased_by uuid REFERENCES auth.users(id);

-- Create table for Namecheap account balance
CREATE TABLE IF NOT EXISTS public.namecheap_balance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  balance_usd numeric(10,2) NOT NULL DEFAULT 0,
  balance_brl numeric(10,2) NOT NULL DEFAULT 0,
  last_synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on namecheap_balance
ALTER TABLE public.namecheap_balance ENABLE ROW LEVEL SECURITY;

-- Create policies for namecheap_balance
CREATE POLICY "Users can view own balance"
ON public.namecheap_balance
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own balance"
ON public.namecheap_balance
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own balance"
ON public.namecheap_balance
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_domains_zone_id ON public.domains(zone_id);
CREATE INDEX IF NOT EXISTS idx_domains_purchased_by ON public.domains(purchased_by);
CREATE INDEX IF NOT EXISTS idx_namecheap_balance_user_id ON public.namecheap_balance(user_id);