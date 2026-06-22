// Supabase Edge Function: AI 分析进展并建议进度和状态
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
    const { taskTitle, lastProgress, thisTarget, apiUrl } = await req.json();

    if (!taskTitle && !lastProgress && !thisTarget) {
      return new Response(
        JSON.stringify({ progress: null, status: null, suggestion: "无内容可分析" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const finalApiUrl = apiUrl
      || Deno.env.get("DEEPSEEK_API_URL")
      || "https://api.deepseek.com/v1/chat/completions";

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ progress: null, status: null, suggestion: "未配置 AI Key" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch(finalApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: `你是一个项目进度分析助手。根据任务名称、上月进展和本月目标，请分析当前合理的完成进度百分比和状态。

返回 JSON 格式：{"progress": 数字0-100, "status": "pending|in_progress|completed", "suggestion": "简短的分析建议"}

规则：
1. 如果上月进展描述了大量完成内容且本月目标较少 → progress 70-90, status "in_progress"
2. 如果上月进展为空或很少且本月目标明确 → progress 10-30, status "in_progress"
3. 如果上月进展描述了"已完成"相关词汇 → progress 100, status "completed"
4. 如果两者都为空或很少 → progress 0-10, status "pending"
5. suggestion 控制在20字以内
6. 只返回 JSON，不要带 markdown 标记`,
            },
            {
              role: "user",
              content: `任务名称：${taskTitle || "未知"}\n上月进展：${lastProgress || "未填写"}\n本月目标：${thisTarget || "未填写"}`,
            },
          ],
          max_tokens: 200,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ progress: null, status: null, suggestion: "AI API 异常" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    let parsed = null;
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch (_) {
        try {
          const cleaned = jsonMatch[0]
            .replace(/'/g, '"')
            .replace(/,\s*}/g, '}');
          parsed = JSON.parse(cleaned);
        } catch (__) {}
      }
    }

    if (parsed) {
      return new Response(
        JSON.stringify(parsed),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(
      JSON.stringify({ progress: null, status: null, suggestion: content.slice(0, 100) }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ progress: null, status: null, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});