import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://xvqcykwffbpeakpqrqat.supabase.co';
const supabaseAnonKey = 'sb_publishable_8NVyMi6orudu_EUt2T1V_Q_iCZ9k0yt';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function testSupabaseConnection() {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Falha ao testar a conexão com o Supabase.', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return false;
  }

  console.info('Conexão com o Supabase realizada com sucesso.', {
    rowsReturned: data?.length ?? 0,
  });
  return true;
}

void testSupabaseConnection();
