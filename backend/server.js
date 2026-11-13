require("dotenv").config();
const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const db = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;

app.use(express.json({ limit: "32kb" }));
const fail = (res, status, message) => res.status(status).json({ ok: false, message });

app.get("/api/config", (_req, res) => {
  if (!supabaseUrl || !publishableKey) return fail(res, 503, "Public Supabase configuration is missing.");
  res.json({ supabaseUrl, publishableKey });
});
app.get("/api/health", (_req, res) => res.json({
  ok: true, app: "Wake & Pay Kenya", databaseConfigured: !!db,
  mpesaEnabled: !!(process.env.DARAJA_CONSUMER_KEY && process.env.DARAJA_CONSUMER_SECRET &&
    process.env.DARAJA_SHORTCODE && process.env.DARAJA_PASSKEY)
}));

async function authenticate(req, res, next) {
  if (!db) return fail(res, 503, "Server database configuration is missing.");
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return fail(res, 401, "Sign in is required.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return fail(res, 401, "Your session is invalid or expired.");
  req.user = data.user;
  req.token = token;
  next();
}
async function requireAdmin(req, res, next) {
  const { data, error } = await db.from("profiles").select("id,display_name,role")
    .eq("id", req.user.id).maybeSingle();
  if (error) return fail(res, 503, "Could not verify account permissions.");
  if (!data || data.role !== "admin") return fail(res, 403, "Administrator access required.");
  req.profile = data;
  next();
}
const admin = [authenticate, requireAdmin];
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(err => {
  console.error("API error:", err.message);
  fail(res, 500, "The request could not be completed.");
});
function cleanText(value, max = 100) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
async function audit(deviceId, eventType, details = {}) {
  const { error } = await db.from("device_events").insert({
    device_id: deviceId, event_type: eventType, details
  });
  if (error) console.error("Audit log failed:", error.message);
}

app.get("/api/admin/me", authenticate, asyncRoute(async (req, res) => {
  const { data, error } = await db.from("profiles").select("id,display_name,role")
    .eq("id", req.user.id).maybeSingle();
  if (error) return fail(res, 503, "Could not verify your account permissions.");
  if (!data || data.role !== "admin") return fail(res, 403, "This account is not an administrator.");
  res.json({ ok: true, user: { email: req.user.email, displayName: data.display_name, role: data.role } });
}));

app.get("/api/admin/summary", ...admin, asyncRoute(async (_req, res) => {
  const [devices, active, pending, payments, fees] = await Promise.all([
    db.from("devices").select("id", { count: "exact", head: true }),
    db.from("devices").select("id", { count: "exact", head: true }).eq("activation_status", "active"),
    db.from("devices").select("id", { count: "exact", head: true }).eq("activation_status", "pending"),
    db.from("payment_transactions").select("amount_kes").eq("status", "paid")
      .gte("verified_at", new Date(new Date().setHours(0,0,0,0)).toISOString()),
    db.from("fee_settings").select("snooze_fee_kes,stop_fee_kes,updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  for (const r of [devices, active, pending, payments, fees]) if (r.error) return fail(res, 503, r.error.message);
  res.json({ ok: true, devices: devices.count || 0, active: active.count || 0,
    pending: pending.count || 0, paidToday: (payments.data || []).reduce((n,p) => n + p.amount_kes, 0),
    fees: fees.data || { snooze_fee_kes: 10, stop_fee_kes: 50 } });
}));

app.get("/api/admin/devices", ...admin, asyncRoute(async (_req, res) => {
  const { data, error } = await db.from("devices")
    .select("id,owner_id,device_label,consented_at,consent_version,activation_status,activated_at,created_at")
    .order("created_at", { ascending: false }).limit(200);
  if (error) return fail(res, 503, error.message);
  res.json({ ok: true, devices: data || [] });
}));

// Admin may create a pending record. The owner must separately consent before activation.
app.post("/api/admin/devices", ...admin, asyncRoute(async (req, res) => {
  const ownerId = cleanText(req.body.owner_id, 64);
  const label = cleanText(req.body.device_label, 80);
  if (!/^[0-9a-f-]{36}$/i.test(ownerId) || !label) return fail(res, 400, "Enter a valid owner account UUID and device name.");
  const { data: owner, error: ownerError } = await db.from("profiles").select("id").eq("id", ownerId).maybeSingle();
  if (ownerError || !owner) return fail(res, 404, "Owner profile not found. The owner must create an account first.");
  const { data, error } = await db.from("devices").insert({
    owner_id: ownerId, device_label: label, activation_status: "pending"
  }).select("id,owner_id,device_label,activation_status,created_at").single();
  if (error) return fail(res, 400, error.message);
  await audit(data.id, "registration_created", { by: req.user.id });
  res.status(201).json({ ok: true, device: data, message: "Pending registration created. The owner must consent before activation." });
}));

// Owner-consent endpoint: authenticated owner, matching owner_id, explicit confirmation.
app.post("/api/owner/devices/:id/consent", authenticate, asyncRoute(async (req, res) => {
  if (req.body?.consent !== true) return fail(res, 400, "Explicit consent is required.");
  const version = cleanText(req.body.consent_version || "v1", 30);
  const { data, error } = await db.from("devices").update({
    consented_at: new Date().toISOString(), consent_version: version
  }).eq("id", req.params.id).eq("owner_id", req.user.id)
    .eq("activation_status", "pending")
    .select("id,device_label,consented_at,consent_version").maybeSingle();
  if (error) return fail(res, 400, error.message);
  if (!data) return fail(res, 404, "Pending device not found for this signed-in owner.");
  await audit(data.id, "owner_consent_recorded", { owner_id: req.user.id, consent_version: version });
  res.json({ ok: true, device: data });
}));

app.patch("/api/admin/devices/:id/status", ...admin, asyncRoute(async (req, res) => {
  const status = cleanText(req.body.status, 20);
  if (!["active", "inactive", "revoked"].includes(status)) return fail(res, 400, "Invalid device status.");
  const { data: existing, error: readError } = await db.from("devices")
    .select("id,consented_at,activation_status").eq("id", req.params.id).maybeSingle();
  if (readError || !existing) return fail(res, 404, "Device not found.");
  if (status === "active" && !existing.consented_at) return fail(res, 409, "Owner consent must be recorded before activation.");
  const patch = { activation_status: status,
    activated_by: status === "active" ? req.user.id : null,
    activated_at: status === "active" ? new Date().toISOString() : null };
  const { data, error } = await db.from("devices").update(patch).eq("id", req.params.id)
    .select("id,device_label,activation_status,activated_at").single();
  if (error) return fail(res, 400, error.message);
  await audit(data.id, "activation_status_changed", { status, by: req.user.id });
  res.json({ ok: true, device: data });
}));

app.get("/api/admin/fees", ...admin, asyncRoute(async (_req, res) => {
  const { data, error } = await db.from("fee_settings").select("*")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return fail(res, 503, error.message);
  res.json({ ok: true, fees: data || { snooze_fee_kes: 10, stop_fee_kes: 50 } });
}));
app.put("/api/admin/fees", ...admin, asyncRoute(async (req, res) => {
  const snooze = Number(req.body.snooze_fee_kes), stop = Number(req.body.stop_fee_kes);
  if (!Number.isInteger(snooze) || !Number.isInteger(stop) || snooze < 1 || stop < 1 || snooze > 10000 || stop > 10000)
    return fail(res, 400, "Fees must be whole KSh amounts between 1 and 10,000.");
  const { data: current, error: readError } = await db.from("fee_settings").select("id")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (readError) return fail(res, 503, readError.message);
  let result;
  if (current) result = await db.from("fee_settings").update({
    snooze_fee_kes: snooze, stop_fee_kes: stop, updated_by: req.user.id, updated_at: new Date().toISOString()
  }).eq("id", current.id).select("snooze_fee_kes,stop_fee_kes,updated_at").single();
  else result = await db.from("fee_settings").insert({
    snooze_fee_kes: snooze, stop_fee_kes: stop, updated_by: req.user.id
  }).select("snooze_fee_kes,stop_fee_kes,updated_at").single();
  if (result.error) return fail(res, 400, result.error.message);
  res.json({ ok: true, fees: result.data });
}));

app.get("/api/admin/alarms", ...admin, asyncRoute(async (_req, res) => {
  const { data, error } = await db.from("alarms")
    .select("id,device_id,label,scheduled_at,timezone,enabled,created_at,devices(device_label,owner_id)")
    .order("scheduled_at", { ascending: true }).limit(200);
  if (error) return fail(res, 503, error.message);
  res.json({ ok: true, alarms: data || [] });
}));
app.post("/api/admin/alarms", ...admin, asyncRoute(async (req, res) => {
  const deviceId = cleanText(req.body.device_id, 64);
  const label = cleanText(req.body.label || "Wake up", 80);
  const scheduled = new Date(req.body.scheduled_at);
  if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !label || !Number.isFinite(scheduled.getTime()))
    return fail(res, 400, "Enter a valid device ID, alarm label and date/time.");
  const { data: device, error: deviceError } = await db.from("devices")
    .select("id,activation_status").eq("id", deviceId).maybeSingle();
  if (deviceError || !device || device.activation_status !== "active")
    return fail(res, 409, "Alarm can only be assigned to an active device.");
  const { data, error } = await db.from("alarms").insert({
    device_id: deviceId, label, scheduled_at: scheduled.toISOString(), timezone: "Africa/Nairobi"
  }).select("*").single();
  if (error) return fail(res, 400, error.message);
  await audit(deviceId, "alarm_created", { alarm_id: data.id, by: req.user.id });
  res.status(201).json({ ok: true, alarm: data });
}));
app.patch("/api/admin/alarms/:id", ...admin, asyncRoute(async (req, res) => {
  const patch = {};
  if (typeof req.body.enabled === "boolean") patch.enabled = req.body.enabled;
  if (req.body.label !== undefined) patch.label = cleanText(req.body.label, 80);
  if (!Object.keys(patch).length) return fail(res, 400, "No supported alarm changes supplied.");
  const { data, error } = await db.from("alarms").update(patch).eq("id", req.params.id).select("*").maybeSingle();
  if (error) return fail(res, 400, error.message);
  if (!data) return fail(res, 404, "Alarm not found.");
  res.json({ ok: true, alarm: data });
}));

app.get("/api/admin/payments", ...admin, asyncRoute(async (_req, res) => {
  const { data, error } = await db.from("payment_transactions")
    .select("id,owner_id,device_id,alarm_id,action_type,amount_kes,phone_number,status,mpesa_receipt_number,verified_at,created_at")
    .order("created_at", { ascending: false }).limit(100);
  if (error) return fail(res, 503, error.message);
  res.json({ ok: true, payments: data || [] });
}));
app.get("/api/admin/events", ...admin, asyncRoute(async (_req, res) => {
  const { data, error } = await db.from("device_events")
    .select("id,device_id,event_type,details,created_at").order("created_at", { ascending: false }).limit(100);
  if (error) return fail(res, 503, error.message);
  res.json({ ok: true, events: data || [] });
}));
app.get("/api/db-check", asyncRoute(async (_req, res) => {
  const { error } = await db.from("profiles").select("id", { head: true }).limit(1);
  if (error) return fail(res, 503, "Database check failed.");
  res.json({ ok: true, message: "Supabase database connected." });
}));

app.use(express.static(path.join(__dirname, "..", "public")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`Wake & Pay Kenya running at http://localhost:${PORT}`));
