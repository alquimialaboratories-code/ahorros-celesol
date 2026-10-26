import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://isxurwtrxsujbmqhruht.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzeHVyd3RyeHN1amJtcWhydWh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjk3NzAsImV4cCI6MjA5MDc0NTc3MH0.IlUAW2Vky_HYOUV3nY3KGeCpGf_J52R4ubObv_H-nZU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
