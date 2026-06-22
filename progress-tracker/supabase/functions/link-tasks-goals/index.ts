// Supabase Edge Function: AI 自动关联任务与目标
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
    const { tasks, goals, apiUrl } = await req.json();

    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({ matches: [], warning: "无任务需要关联" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }
    if (!goals || goals.length === 0) {
      return new Response(
        JSON.stringify({ matches: [], warning: "无目标可关联" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const finalApiUrl = apiUrl
      || Deno.env.get("DEEPSEEK_API_URL")
      || "https://api.deepseek.com/v1/chat/completions";

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ matches: [], warning: "未配置 AI Key" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const taskList = tasks.map((t, i) =>
      `[任务${i}] ${t.title} | 描述：${t.description || "无"} | 当前关联目标：${t.goalTitle || "未关联"}`
    ).join("\n");

    const goalList = goals.map((g, i) =>
      `[目标${i}] ${g.id} ${g.title} | ${g.description || "无"} | ${g.year || ""} Q${g.quarter || ""}`
    ).join("\n");

    console.log(`Linking ${tasks.length} tasks to ${goals.length} goals`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

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
              content: `你是一个任务与目标关联分析助手。请分析每项任务最可能属于哪个目标。

返回 JSON 数组：[{"taskIndex": 任务编号, "goalId": "目标ID（目标列表中的id）", "reason": "关联理由"}]

规则：
1. 根据任务标题和描述，匹配语义最相关的目标
2. 如果任务已有当前关联且合理，可以保持不变
3. 如果找不到合适的目标，goalId 填 null
4. 只返回 JSON 数组，不要带 markdown 标记`,
            },
            {
              role: "user",
              content: `任务列表：\n${taskList}\n\n目标列表：\n${goalList}`,
            },
          ],
          max_tokens: 4000,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ matches: [], warning: `AI API 返回错误 ${response.status}` }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    console.log(`Link response: ${content.slice(0, 500)}`);

    let matches = null;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try { matches = JSON.parse(jsonMatch[0]); } catch (_) {
        // Try cleaning up: replace single quotes, fix trailing commas, etc.
        try {
          const cleaned = jsonMatch[0]
            .replace(/'/g, '"')
            .replace(/,\s*]/g, ']')
            .replace(/,\s*}/g, '}');
          matches = JSON.parse(cleaned);
        } catch (__) {}
      }
    }

    // Fallback: extract individual objects
    if (!matches) {
      const objMatches = content.match(/\{[^}]+\}/g);
      if (objMatches) {
        matches = objMatches.map(s => {
          try { return JSON.parse(s); } catch (_) { return null; }
        }).filter(Boolean);
      }
    }

    if (matches && matches.length > 0) {
      return new Response(
        JSON.stringify({ matches }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(
      JSON.stringify({ matches: [], warning: "AI 返回格式异常", raw: content.slice(0, 500) }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ matches: [], error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});