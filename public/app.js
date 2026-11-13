import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const $ = id => document.getElementById(id);
let client;
let session;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function message(id, text, bad=false) { $(id).textContent = text; $(id).className = bad ? "message error" : "message"; }
async function api(url, options={}) {
  const response = await fetch(url, { ...options, headers: {
    "Content-Type":"application/json", Authorization:`Bearer ${session.access_token}`, ...(options.headers||{})
  }});
  const data = await response.json().catch(()=>({message:"Invalid server response"}));
  if (!response.ok || !data.ok) throw new Error(data.message || "Request failed.");
  return data;
}
function showLogin(msg="") { $("dashboardScreen").hidden=true; $("loginScreen").hidden=false; message("loginMessage",msg,true); }
function showDashboard(user) { $("loginScreen").hidden=true; $("dashboardScreen").hidden=false; $("adminEmail").textContent=user.email||"Administrator"; $("year").textContent=new Date().getFullYear(); }
async function verify(s) {
  if (!s?.access_token) return showLogin();
  session=s;
  const r=await fetch("/api/admin/me",{headers:{Authorization:`Bearer ${s.access_token}`}});
  const d=await r.json();
  if(!r.ok||!d.ok){await client.auth.signOut();session=null;return showLogin(d.message||"Administrator access denied.");}
  showDashboard(d.user); await loadAll();
}
async function loadAll() {
  try {
    const [sum, devices, alarms, payments, events, fees]=await Promise.all([
      api("/api/admin/summary"),api("/api/admin/devices"),api("/api/admin/alarms"),
      api("/api/admin/payments"),api("/api/admin/events"),api("/api/admin/fees")
    ]);
    $("deviceCount").textContent=sum.devices;$("activeCount").textContent=sum.active;$("pendingCount").textContent=sum.pending;
    $("paidToday").textContent=`KSh ${sum.paidToday}`;$("snoozeFee").value=fees.fees.snooze_fee_kes;$("stopFee").value=fees.fees.stop_fee_kes;
    $("devicesBody").innerHTML=devices.devices.map(d=>`<tr><td><strong>${esc(d.device_label)}</strong><small>${esc(d.id)}</small></td><td>${esc(d.owner_id)}</td><td>${d.consented_at?"Recorded":"Not yet given"}</td><td><span class="status ${esc(d.activation_status)}">${esc(d.activation_status)}</span></td><td>${d.activation_status==="pending"&&d.consented_at?`<button class="action" data-id="${esc(d.id)}" data-status="active">Activate</button>`:""} ${d.activation_status==="active"?`<button class="action" data-id="${esc(d.id)}" data-status="inactive">Suspend</button>`:""} ${d.activation_status!=="revoked"?`<button class="action danger" data-id="${esc(d.id)}" data-status="revoked">Revoke</button>`:""} <button class="action" data-copy="${esc(d.id)}">Copy ID</button></td></tr>`).join("")||'<tr><td colspan="5">No registered phones.</td></tr>';
    $("alarmsList").innerHTML=alarms.alarms.map(a=>`<div class="list-row"><div><b>${esc(a.label)}</b><small>${esc(a.device_id)} · ${new Date(a.scheduled_at).toLocaleString()}</small></div><button class="action" data-alarm="${esc(a.id)}" data-enabled="${!a.enabled}">${a.enabled?"Disable":"Enable"}</button></div>`).join("")||"No alarms scheduled.";
    $("paymentsBody").innerHTML=payments.payments.map(p=>`<tr><td>${new Date(p.created_at).toLocaleString()}</td><td>${esc(p.action_type)}</td><td>KSh ${esc(p.amount_kes)}</td><td>${esc(p.status)}</td><td>${esc(p.mpesa_receipt_number||"—")}</td></tr>`).join("")||'<tr><td colspan="5">No transactions recorded.</td></tr>';
    $("eventsList").innerHTML=events.events.map(e=>`<div class="list-row"><div><b>${esc(e.event_type)}</b><small>${esc(e.device_id)} · ${new Date(e.created_at).toLocaleString()}</small></div></div>`).join("")||"No activity recorded.";
    $("notice").textContent="Live database records loaded. Android app enrollment and M-Pesa payments are not yet connected.";
  } catch(e) { $("notice").textContent=e.message; }
}
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginButton").disabled=true;message("loginMessage","Signing in…");try{
 const {data,error}=await client.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error)throw error;await verify(data.session);
 }catch(err){message("loginMessage",err.message,true);}finally{$("loginButton").disabled=false;}});
$("logoutButton").addEventListener("click",async()=>{await client.auth.signOut();session=null;showLogin("You have signed out.");});
$("deviceForm").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/api/admin/devices",{method:"POST",body:JSON.stringify({owner_id:$("ownerId").value.trim(),device_label:$("deviceLabel").value.trim()})});message("deviceMessage",d.message);e.target.reset();await loadAll();}catch(err){message("deviceMessage",err.message,true);}});
$("devicesBody").addEventListener("click",async e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.copy){await navigator.clipboard.writeText(b.dataset.copy);return;}
if(b.dataset.status){try{await api(`/api/admin/devices/${b.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({status:b.dataset.status})});await loadAll();}catch(err){alert(err.message);}}});
$("feeForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/admin/fees",{method:"PUT",body:JSON.stringify({snooze_fee_kes:Number($("snoozeFee").value),stop_fee_kes:Number($("stopFee").value)})});message("feeMessage","Fees saved.");await loadAll();}catch(err){message("feeMessage",err.message,true);}});
$("alarmForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/admin/alarms",{method:"POST",body:JSON.stringify({device_id:$("alarmDevice").value.trim(),label:$("alarmLabel").value.trim(),scheduled_at:new Date($("alarmTime").value).toISOString()})});message("alarmMessage","Alarm record created.");await loadAll();}catch(err){message("alarmMessage",err.message,true);}});
$("alarmsList").addEventListener("click",async e=>{const b=e.target.closest("button[data-alarm]");if(!b)return;try{await api(`/api/admin/alarms/${b.dataset.alarm}`,{method:"PATCH",body:JSON.stringify({enabled:b.dataset.enabled==="true"})});await loadAll();}catch(err){alert(err.message);}});
async function start(){try{const c=await fetch("/api/config").then(r=>r.json());if(!c.supabaseUrl)throw Error(c.message||"Supabase settings unavailable.");client=createClient(c.supabaseUrl,c.publishableKey);const {data}=await client.auth.getSession();if(data.session)await verify(data.session);else showLogin();client.auth.onAuthStateChange((_ev,s)=>{session=s;if(s)setTimeout(()=>verify(s),0);else showLogin();});}catch(e){showLogin(e.message);}}
start();