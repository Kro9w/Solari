import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (...args) => {
      const [input, init] = args;
      const options = { ...init, cache: 'no-store' as RequestCache };
      return fetch(input, options);
    }
  }
});