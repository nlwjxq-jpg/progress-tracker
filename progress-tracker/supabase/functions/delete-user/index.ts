import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://uovrvtbyckdtnonvdrpx.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvdnJ2dGJ5Y2tkdG5vbnZkcnB4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTA5ODYxMSwiZXhwIjoyMDk2Njc0NjExfQ.60SYUSHWIPq2V7Jl5k-CweEin-820I5zWAUm4TZIs_4";

Deno.serve(async (req) => {
  try {
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
    const { request_id, email, name } = body;

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Find and delete auth user by email
    const { data: users } = await adminClient.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email === email);
    if (user) {
      await adminClient.auth.admin.deleteUser(user.id);
    }

    // 2. Delete department_members record
    await adminClient.from("department_members").delete().eq("name", name);

    // 3. Delete registration request
    await adminClient.from("registration_requests").delete().eq("id", request_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
