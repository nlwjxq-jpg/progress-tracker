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

    // 1. Find the user by email
    const { data: users } = await adminClient.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email === email);
    
    if (user) {
      // 2. Unlink department_members (clear user_id, keep the record)
      await adminClient.from("department_members").update({ user_id: null }).eq("user_id", user.id);
      
      // 3. Remove user_roles record
      await adminClient.from("user_roles").delete().eq("user_id", user.id);
      
      // 4. Delete auth user
      await adminClient.auth.admin.deleteUser(user.id);
    } else {
      // User doesn't exist in auth, just unlink by name
      await adminClient.from("department_members").update({ user_id: null }).eq("name", name);
    }

    // 5. Delete registration request
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
