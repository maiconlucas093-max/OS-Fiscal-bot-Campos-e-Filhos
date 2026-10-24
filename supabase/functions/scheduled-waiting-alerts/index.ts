import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const minutes = Math.max(1, Number(Deno.env.get("RECEIVE_ALERT_MINUTES") || "15"));
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data: orders, error } = await supabase.from("osfiscal_orders")
    .select("legacy_id,code,description,employee_legacy_id,created_at")
    .eq("status", "waiting").is("waiting_alerted_at", null).lt("created_at", cutoff).limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_WHATSAPP_FROM");
  const managerTo = (Deno.env.get("MANAGER_WHATSAPP_TO") || "").replace(/\D/g, "");
  if (!sid || !token || !from || !managerTo) return Response.json({ error: "Configure as credenciais Twilio e MANAGER_WHATSAPP_TO" }, { status: 503 });
  const results = [];
  for (const order of orders || []) {
    const { data: employee } = await supabase.from("osfiscal_employees").select("name").eq("legacy_id", order.employee_legacy_id).maybeSingle();
    const body = new URLSearchParams({ To:`whatsapp:+${managerTo}`, From:from.startsWith("whatsapp:")?from:`whatsapp:${from}`, Body:`ALERTA OS Fiscal Bot: ${order.code} está aguardando confirmação há mais de ${minutes} minutos.\nFuncionário: ${employee?.name || order.employee_legacy_id}\nServiço: ${order.description}` });
    const sent = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method:"POST", headers:{ Authorization:`Basic ${btoa(`${sid}:${token}`)}`, "Content-Type":"application/x-www-form-urlencoded" }, body });
    const response = await sent.json();
    if (sent.ok) {
      await supabase.from("osfiscal_orders").update({ waiting_alerted_at:new Date().toISOString() }).eq("legacy_id", order.legacy_id);
      await supabase.from("osfiscal_events").insert({ id:crypto.randomUUID(), order_legacy_id:order.legacy_id, employee_legacy_id:order.employee_legacy_id, action:"Alerta de recebimento enviado ao encarregado", detail:`Sem confirmação após ${minutes} minutos`, actor:"scheduled-waiting-alerts" });
      results.push({ code:order.code, sent:true });
    } else results.push({ code:order.code, sent:false, error:response.message || "Falha Twilio" });
  }
  return Response.json({ checked:(orders||[]).length, results });
});
  
