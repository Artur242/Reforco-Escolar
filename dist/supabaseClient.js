// O site é servido como módulos ESM sem bundler; o navegador precisa de uma URL.
// @ts-expect-error O TypeScript não resolve imports HTTP, mas o navegador resolve.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabaseUrl = 'https://xvqcykwffbpeakpqrqat.supabase.co';
const supabaseAnonKey = 'sb_publishable_8NVyMi6orudu_EUt2T1V_Q_iCZ9k0yt';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
