import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

const { url, key } = config.api.supabase;

if (!url || !key) {
  console.warn(
    'Supabase URL or Key is not set. Database features will be disabled.'
  );
}

export const supabase = url && key ? createClient(url, key) : null;
