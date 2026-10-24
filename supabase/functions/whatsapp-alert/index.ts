import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(url, service);
    const { orderId, action, message } = await req.json();
    if (!orderId || !action) return new Response(JSON.stringify({ error: "orderId e action são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: profile } = await admin.from("osfiscal_profiles").select("role,employee_legacy_id").eq("user_id", auth.user.id).single();
    const { data: order, error: orderError } = await admin.from("osfiscal_orders").select("legacy_id,code,description,status,employee_legacy_id").eq("legacy_id", String(orderId)).single();
    if (orderError || !order) return new Response(JSON.stringify({ error: "OS não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!profile || (!(profile.role === "admin" || profile.role === "manager") && profile.employee_legacy_id !== order.employee_legacy_id)) {
      return new Response(JSON.stringify({ error: "Sem permissão para esta OS" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: employee } = await admin.from("osfiscal_employees").select("phone,name").eq("legacy_id", order.employee_legacy_id).single();
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const to = (employee?.phone || "").replace(/\D/g, "");
    if (!accountSid || !authToken || !from || !to) return new Response(JSON.stringify({ error: "Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM e telefone do funcionário." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const body = new URLSearchParams({ To: `whatsapp:+${to}`, From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`, Body: (typeof message === "string" && message.length <= 1500) ? message : `Campos e Filhos — ${order.code}\n${order.description}\nAtualização: ${action}\nStatus: ${order.status}` });
    const twilio = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST", headers: { "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const result = await twilio.json();
    if (!twilio.ok) return new Response(JSON.stringify({ error: result.message || "Falha no provedor WhatsApp" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, sid: result.sid }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro inesperado" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
