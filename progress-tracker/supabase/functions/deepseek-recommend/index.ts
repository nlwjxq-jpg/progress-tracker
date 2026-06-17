// Supabase Edge Function: AI 任务分工推荐中转
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { taskTitle, taskDescription, members, apiUrl } = await req.json();

    const memberList = members
      .map((m) => `${m.name}（${m.role || "成员"}，当前任务数：${m.task_count || 0}，擅长：${m.skills || "未设置"}）`)
      .join("\n");

    const finalApiUrl = apiUrl
      || Deno.env.get("DEEPSEEK_API_URL")
      || "https://api.deepseek.com/v1/chat/completions";

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!apiKey) {
      const sorted = [...members].sort((a, b) => (a.task_count || 0) - (b.task_count || 0));
      return new Response(
        JSON.stringify({
          name: sorted[0]?.name || "",
          reason: "当前任务负载最低（未配置 API Key，使用规则匹配）",
        }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    console.log(`Calling DeepSeek API for recommend: ${finalApiUrl}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let response;
    try {
      response = await fetch(finalApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: `你是一个任务分工助手。根据任务标题和描述，从以下团队成员中选择最合适的人选。考虑因素：角色匹配度、当前任务负载（优先分配给负载低的人）、技能匹配。只返回一个JSON对象，格式为 {"name":"成员名","reason":"一句话理由"}，不要输出其他内容。`,
            },
            {
              role: "user",
              content: `任务标题：${taskTitle}\n任务描述：${taskDescription}\n\n团队成员：\n${memberList}`,
            },
          ],
          max_tokens: 200,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.error(`DeepSeek API error: ${response.status} ${errText}`);
      const sorted = [...members].sort((a, b) => (a.task_count || 0) - (b.task_count || 0));
      return new Response(
        JSON.stringify({ name: sorted[0]?.name || "", reason: `API 异常，按负载最低分配` }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    console.log(`DeepSeek recommend response: ${content}`);

    const jsonMatch = content.match(/\{[^}]+\}/);

    if (jsonMatch) {
      return new Response(
        JSON.stringify(JSON.parse(jsonMatch[0])),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const sorted = [...members].sort((a, b) => (a.task_count || 0) - (b.task_count || 0));
    return new Response(
      JSON.stringify({ name: sorted[0]?.name || "", reason: "当前任务负载最低" }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    console.error(`Function error: ${err.message}`);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});