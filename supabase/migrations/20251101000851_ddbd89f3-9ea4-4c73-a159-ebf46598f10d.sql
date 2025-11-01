-- Criar tabela de logs de atividade dos domínios
CREATE TABLE IF NOT EXISTS public.domain_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Criar índice para melhorar performance de busca por domínio
CREATE INDEX IF NOT EXISTS idx_domain_activity_logs_domain_id ON public.domain_activity_logs(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_activity_logs_created_at ON public.domain_activity_logs(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.domain_activity_logs ENABLE ROW LEVEL SECURITY;

-- Política para permitir que qualquer usuário autenticado veja os logs de qualquer domínio
CREATE POLICY "Authenticated users can view all domain logs"
  ON public.domain_activity_logs
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Política para permitir que usuários autenticados criem logs
CREATE POLICY "Authenticated users can create logs"
  ON public.domain_activity_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);