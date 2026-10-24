/* Configure no Supabase Dashboard > Project Settings > API.
   Nunca coloque service_role key, token do WhatsApp ou segredos neste arquivo. */
window.OSF_CONFIG = {
  supabaseUrl: "COLE_A_URL_DO_SEU_PROJETO_SUPABASE",
  supabaseAnonKey: "COLE_A_CHAVE_ANON_PUBLICA_DO_SUPABASE",
  // URL pública do aplicativo hospedado em HTTPS, sem parâmetros.
  appUrl: "COLE_A_URL_PUBLICA_DO_APLICATIVO",
  // URL da Edge Function para alertas WhatsApp (opcional até configurar o servidor).
  whatsappFunctionUrl: "",
  // Minutos para alertar se não houver confirmação.
  receiveAlertMinutes: 15
};
