import { createClient } from '@supabase/supabase-js';
// Substitua pelos valores que você encontrou no Passo 1 (ou use variáveis de ambiente)
const supabaseUrl = 'https://xvqcykwffbpeakpqrqat.supabase.co';
const supabaseAnonKey = 'sb_publishable_8NVyMi6orudu_EUt2T1V_Q_iCZ9k0yt';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
