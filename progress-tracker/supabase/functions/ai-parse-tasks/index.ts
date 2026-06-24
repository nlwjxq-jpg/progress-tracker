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

    // Increased from 8000 to 24000 to handle larger spreadsheets
    const truncated = textContent.slice(0, 24000);

    console.log(`Calling DeepSeek API: ${finalApiUrl} with ${truncated.length} chars`);

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
              content: `你是一个工作任务分析助手。用户上传了一份年度/季度工作任务表内容（来自Excel解析），请从中提取所有任务项。

输入格式说明：
- 每行代表一条任务，列之间用 " | " 分隔
- 第一行是表头，列出各列名称（如：任务类别、考核目标、具体任务、截止日期、状态、工作责任人、部门负责人、一季度、二季度、三季度、四季度、上月工作目标、进度）
- 表头中的"一季度/二季度/三季度/四季度"列分别对应 Q1/Q2/Q3/Q4 的季度目标
- "上月工作目标"和"进度"列不是季度目标，不要混淆

返回一个 JSON 数组，每个元素格式：
{
  "title": "任务名称（取"具体任务"列的完整内容，或如果没有具体任务列则用任务主题）",
  "description": "任务描述，包含考核目标等补充信息",
  "due_date": "截止日期（YYYY-MM-DD格式，如无明确日期则填null）",
  "priority": "low|normal|high|urgent（根据任务紧急程度判断，默认normal）",
  "q1_target": "Q1季度目标（取表头"一季度"对应列的内容，如该列为空则填null）",
  "q2_target": "Q2季度目标（取表头"二季度"对应列的内容，如该列为空则填null）",
  "q3_target": "Q3季度目标（取表头"三季度"对应列的内容，如该列为空则填null）",
  "q4_target": "Q4季度目标（取表头"四季度"对应列的内容，如该列为空则填null）"
}

规则：
1. 第一行是表头，从第二行开始提取任务
2. 根据表头定位"一季度/二季度/三季度/四季度"列，正确提取对应的 Q1-Q4 目标
3. 不要将"上月工作目标"或"进度"列的内容填入 q1-q4_target
4. "具体任务"列内容作为 title；如果有"考核目标"列，其内容合并到 description
5. 同类子任务应拆分为独立条目
6. 没有明确截止日期的，due_date 填 null
7. 如果某季度目标列的内容为"——"或空，该字段填 null
8. 只返回 JSON 数组，不要带任何 markdown 标记或解释文字
9. 如果内容中没有任何可识别的任务，返回空数组 []`,
            },
            {
              role: "user",
              content: `请分析以下工作任务表内容，提取所有任务：\n\n${truncated}`,
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
        JSON.stringify({ tasks: [], warning: `AI API 返回错误 ${response.status}，请稍后重试` }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    console.log(`DeepSeek response: ${content.slice(0, 500)}`);

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

    // Method 2: try to fix common issues - extract objects one by one
    if (!tasks) {
      const objMatches = content.match(/\{[^{}]+\}/g);
      if (objMatches) {
        tasks = objMatches.map(s => {
          try { return JSON.parse(s); } catch (_) { return null; }
        }).filter(Boolean);
      }
    }

    // Method 3: try to find array between [ and ] with more relaxed parsing
    if (!tasks) {
      try {
        const m = content.match(/\[([\s\S]*)\]/);
        if (m) {
          const inner = m[1];
          const objRegex = /\{[^{}]*\}/g;
          const objs = inner.match(objRegex) || [];
          tasks = objs.map(s => {
            try { return JSON.parse(s); } catch (_) { return null; }
          }).filter(Boolean);
        }
      } catch (_) {}
    }

    if (tasks && tasks.length > 0) {
      // Clean up tasks - trim strings, normalize nulls
      tasks = tasks.map(t => ({
        title: (t.title || "").trim(),
        description: (t.description || "").trim(),
        due_date: t.due_date || null,
        priority: t.priority || "normal",
        q1_target: t.q1_target ? String(t.q1_target).trim() : null,
        q2_target: t.q2_target ? String(t.q2_target).trim() : null,
        q3_target: t.q3_target ? String(t.q3_target).trim() : null,
        q4_target: t.q4_target ? String(t.q4_target).trim() : null,
      }));

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
