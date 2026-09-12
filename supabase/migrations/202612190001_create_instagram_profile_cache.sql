-- Migrations: Create instagram_profile_cache table
-- Purpose: Cache Instagram profile data (IGSID -> username mapping) to avoid repeated Graph API calls
-- and reduce rate limit issues when processing webhooks

CREATE TABLE IF NOT EXISTS public.instagram_profile_cache (
  igsid text PRIMARY KEY,
  username text,
  name text,
  profile_pic text,
  suspected_username text,
  discovered_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for faster lookups by ig_sid
CREATE INDEX IF NOT EXISTS idx_instagram_profile_cache_igsid 
ON public.instagram_profile_cache(igsid);

-- Create a function to automatically update updated_at on row updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on every row update
DROP TRIGGER IF EXISTS trigger_update_instagram_profile_cache ON public.instagram_profile_cache;
CREATE TRIGGER trigger_update_instagram_profile_cache
  BEFORE UPDATE ON public.instagram_profile_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment for documentation
COMMENT ON TABLE public.instagram_profile_cache IS 'Cached Instagram profile data from Graph API responses and message text analysis';
COMMENT ON COLUMN public.instagram_profile_cache.username IS 'Official username returned by Facebook Graph API';
COMMENT ON COLUMN public.instagram_profile_cache.suspected_username IS 'Username detected from message text (e.g., @handle mentions), used as candidate only';
