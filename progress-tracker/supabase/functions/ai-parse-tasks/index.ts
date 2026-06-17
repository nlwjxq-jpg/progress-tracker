// Supabase Edge Function: AI 解析任务表
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
        JSON.stringify({ tasks: [], warning: "文件内容为空" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const finalApiUrl = apiUrl
      || Deno.env.get("DEEPSEEK_API_URL")
      || "https://api.deepseek.com/v1/chat/completions";

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ tasks: [], warning: "未配置 AI Key，无法解析" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const truncated = textContent.slice(0, 8000);

    console.log(`Calling DeepSeek API: ${finalApiUrl} with ${truncated.length} chars`);

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
              content: `你是一个工作任务分析助手。用户上传了一份年度/季度工作任务表文本，请从中提取所有任务项。

返回一个 JSON 数组，每个元素格式：
{
  "title": "任务名称",
  "description": "任务描述或补充说明",
  "due_date": "截止日期（YYYY-MM-DD格式，如无明确日期则填null）",
  "priority": "low|normal|high|urgent（根据任务紧急程度判断，默认normal）"
}

规则：
1. 识别表格、列表、段落中的所有独立任务
2. 同类子任务应拆分为独立条目
3. 没有明确截止日期的，due_date 填 null
4. 只返回 JSON 数组，不要带任何 markdown 标记或解释文字
5. 如果内容中没有任何可识别的任务，返回空数组 []`,
            },
            {
              role: "user",
              content: `请分析以下工作任务表内容，提取所有任务：\n\n${truncated}`,
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
      const errText = await response.text().catch(() => "unknown");
      console.error(`DeepSeek API error: ${response.status} ${errText}`);
      return new Response(
        JSON.stringify({ tasks: [], warning: `AI API 返回错误 ${response.status}，请稍后重试` }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    console.log(`DeepSeek response: ${content.slice(0, 300)}`);

    // Try multiple ways to extract JSON array
    let tasks = null;

    // Method 1: direct JSON array match
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        tasks = JSON.parse(jsonMatch[0]);
      } catch (_) {
        // continue to next method
      }
    }

    // Method 2: try to fix common issues - unescaped newlines in strings
    if (!tasks) {
      try {
        const cleaned = content.replace(/(?<!\\)"/g, '\\"').replace(/\n/g, '\\n');
        const m = cleaned.match(/\[[\s\S]*\]/);
        if (m) tasks = JSON.parse(m[0]);
      } catch (_) {}
    }

    // Method 3: extract JSON objects one by one
    if (!tasks) {
      const objMatches = content.match(/\{[^}]+\}/g);
      if (objMatches) {
        tasks = objMatches.map(s => {
          try { return JSON.parse(s); } catch (_) { return null; }
        }).filter(Boolean);
      }
    }

    if (tasks && tasks.length > 0) {
      return new Response(
        JSON.stringify({ tasks }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    return new Response(
      JSON.stringify({ tasks: [], warning: "AI 返回格式异常，请重试", raw: content.slice(0, 500) }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    console.error(`Function error: ${err.message}`);
    return new Response(
      JSON.stringify({ tasks: [], error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});