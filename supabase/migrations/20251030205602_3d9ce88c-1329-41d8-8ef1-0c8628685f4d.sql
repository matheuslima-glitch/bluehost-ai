-- Add whatsapp_number to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_number text;

-- Create notification_settings table
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_suspended boolean DEFAULT false,
  alert_expired boolean DEFAULT false,
  alert_expiring_soon boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS for notification_settings
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for notification_settings
CREATE POLICY "Users can view own notification settings"
  ON public.notification_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification settings"
  ON public.notification_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification settings"
  ON public.notification_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create trigger for notification_settings updated_at
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create custom_filters table for platform and traffic source
CREATE TABLE IF NOT EXISTS public.custom_filters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filter_type text NOT NULL CHECK (filter_type IN ('platform', 'traffic_source')),
  filter_value text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, filter_type, filter_value)
);

-- Enable RLS for custom_filters
ALTER TABLE public.custom_filters ENABLE ROW LEVEL SECURITY;

-- Create policies for custom_filters
CREATE POLICY "Users can view own custom filters"
  ON public.custom_filters
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own custom filters"
  ON public.custom_filters
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom filters"
  ON public.custom_filters
  FOR DELETE
  USING (auth.uid() = user_id);