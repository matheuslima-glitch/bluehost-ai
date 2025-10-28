-- Add new fields to domains table for purchase tracking
ALTER TABLE public.domains
ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS propagation_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS renewal_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cloudflare_zone_id TEXT,
ADD COLUMN IF NOT EXISTS traffic_source TEXT,
ADD COLUMN IF NOT EXISTS structure_type TEXT DEFAULT 'wordpress',
ADD COLUMN IF NOT EXISTS purchase_user_id UUID REFERENCES auth.users(id);

-- Create table for domain classifications
CREATE TABLE IF NOT EXISTS public.domain_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID REFERENCES public.domains(id) ON DELETE CASCADE NOT NULL,
  classification_type TEXT NOT NULL,
  classification_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on domain_classifications
ALTER TABLE public.domain_classifications ENABLE ROW LEVEL SECURITY;

-- Domain classifications policies
CREATE POLICY "Users can view classifications of own domains"
  ON public.domain_classifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.domains
      WHERE domains.id = domain_classifications.domain_id
      AND domains.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert classifications for own domains"
  ON public.domain_classifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.domains
      WHERE domains.id = domain_classifications.domain_id
      AND domains.user_id = auth.uid()
    )
  );

-- Create table for purchase logs
CREATE TABLE IF NOT EXISTS public.purchase_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  domain_name TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS on purchase_logs
ALTER TABLE public.purchase_logs ENABLE ROW LEVEL SECURITY;

-- Purchase logs policies
CREATE POLICY "Users can view own purchase logs"
  ON public.purchase_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert purchase logs"
  ON public.purchase_logs FOR INSERT
  WITH CHECK (true);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_purchase_logs_user_id ON public.purchase_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_logs_timestamp ON public.purchase_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_domain_classifications_domain_id ON public.domain_classifications(domain_id);
