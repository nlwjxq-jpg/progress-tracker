// Edge Function: approve-registration
// Approves a registration request by creating the user in Supabase Auth
// and inserting a department_members record.
// Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in function env.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req: Request) => {
  try {
    // CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const body = await req.json();
    const { request_id, name, email, department_id } = body;

    if (!request_id || !email) {
      return new Response(JSON.stringify({ error: "缺少参数" }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Get the registration request to verify it's pending
    const { data: regReq, error: fetchErr } = await adminClient
      .from("registration_requests")
      .select("*")
      .eq("id", request_id)
      .single();

    if (fetchErr || !regReq) {
      return new Response(JSON.stringify({ error: "未找到注册申请" }), {
        status: 404,
        headers: corsHeaders(),
      });
    }

    if (regReq.status !== "pending") {
      return new Response(JSON.stringify({ error: "该申请已处理" }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    // 2. Create user in Supabase Auth (with a temporary password)
    const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map(b => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[b % 62])
      .join("");

    const { data: authUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createErr) {
      if (createErr.message?.includes("already been registered")) {
        // User already exists - just approve and create member record
        const { data: existingUsers } = await adminClient.auth.admin.listUsers();
        const existing = existingUsers?.users?.find(u => u.email === email);
        if (existing) {
          await adminClient.from("registration_requests").update({
            status: "approved",
            reviewed_at: new Date().toISOString(),
          }).eq("id", request_id);

          await adminClient.from("department_members").insert({
            name,
            role: "成员",
            department_id: department_id || null,
            user_id: existing.id,
            task_count: 0,
          });

          return new Response(JSON.stringify({
            success: true,
            message: "用户已存在，已关联到部门和人员",
            temp_password: null,
          }), { headers: corsHeaders() });
        }
      }
      throw createErr;
    }

    // 3. Mark request as approved
    await adminClient.from("registration_requests").update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
    }).eq("id", request_id);

    // 4. Create department_members record
    await adminClient.from("department_members").insert({
      name,
      role: "成员",
      department_id: department_id || null,
      user_id: authUser.user.id,
      task_count: 0,
    });

    return new Response(JSON.stringify({
      success: true,
      message: "账号已创建",
      temp_password: tempPassword,
    }), { headers: corsHeaders() });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
});

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
}
