// Supabase Edge Function: AI 解析制度修编表
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
    const { textContent, apiUrl } = await req.json();

    if (!textContent || textContent.trim().length === 0) {
      return new Response(
        JSON.stringify({ policies: [], warning: "文件内容为空" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const finalApiUrl = apiUrl
      || Deno.env.get("DEEPSEEK_API_URL")
      || "https://api.deepseek.com/v1/chat/completions";

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ policies: [], warning: "未配置 AI Key，无法解析" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const truncated = textContent.slice(0, 24000);

    console.log(`Calling DeepSeek API for policies: ${finalApiUrl} with ${truncated.length} chars`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

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
              content: `你是一个制度修编任务分析助手。用户上传了一份制度修编表内容（来自Excel解析），请从中提取所有制度修编任务项。

输入格式说明：
- 表头列名通常为：截止日期、修订制度名称、责任人、状态
- 每行代表一个制度修编任务

返回一个 JSON 数组，每个元素格式：
{
  "policy_name": "修订制度名称（含 [新编]/[重大修订]/[非重大修订]/[废止] 标注）",
  "deadline": "截止日期（如为文本描述则保持原文，为空则填null）",
  "assignee": "责任人姓名",
  "status": "状态（已完成/待开始，如为空默认待开始）"
}

规则：
1. 识别表格中的所有制度修编条目
2. 制度名称中 [新编]/[重大修订]/[非重大修订]/[废止] 等标注保留
3. 截止日期为空或无法确定时填 null
4. 状态为空时默认为 "pending"
5. 只返回 JSON 数组，不要带任何 markdown 标记或解释文字
6. 如果内容中没有任何可识别的制度修编任务，返回空数组 []`,
            },
            {
              role: "user",
              content: `请分析以下制度修编表内容，提取所有任务：\n\n${truncated}`,
            },
          ],
          max_tokens: 8000,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.error(`DeepSeek API error: ${response.status} ${errText}`);
      return new Response(
        JSON.stringify({ policies: [], warning: `AI API 返回错误 ${response.status}，请稍后重试` }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    console.log(`DeepSeek response: ${content.slice(0, 500)}`);

    let policies = null;

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try { policies = JSON.parse(jsonMatch[0]); } catch (_) {}
    }

    if (!policies) {
      const objMatches = content.match(/\{[^{}]+\}/g);
      if (objMatches) {
        policies = objMatches.map(s => {
          try { return JSON.parse(s); } catch (_) { return null; }
        }).filter(Boolean);
      }
    }

    if (!policies) {
      try {
        const m = content.match(/\[([\s\S]*)\]/);
        if (m) {
          const objs = (m[1].match(/\{[^{}]*\}/g) || []);
          policies = objs.map(s => {
            try { return JSON.parse(s); } catch (_) { return null; }
          }).filter(Boolean);
        }
      } catch (_) {}
    }

    if (policies && policies.length > 0) {
      policies = policies.map(p => ({
        policy_name: (p.policy_name || "").trim(),
        deadline: p.deadline ? String(p.deadline).trim() : null,
        assignee: (p.assignee || "").trim(),
        status: p.status || "pending",
      }));

      return new Response(
        JSON.stringify({ policies }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(
      JSON.stringify({ policies: [], warning: "AI 返回格式异常，请重试", raw: content.slice(0, 500) }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    console.error(`Function error: ${err.message}`);
    return new Response(
      JSON.stringify({ policies: [], error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
