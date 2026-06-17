// Supabase Edge Function: AI 批量任务分工匹配
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
    const { tasks, deptLeaders, workMembers, apiUrl } = await req.json();

    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({ assignments: [], warning: "无任务需要匹配" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const finalApiUrl = apiUrl
      || Deno.env.get("DEEPSEEK_API_URL")
      || "https://api.deepseek.com/v1/chat/completions";

    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ assignments: [], warning: "未配置 AI Key，无法匹配" }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const leaderList = (deptLeaders || []).map((m) =>
      `${m.name}（${m.role}，当前任务数：${m.task_count || 0}，擅长：${m.skills || "未设置"}）`
    ).join("\n");

    const memberList = (workMembers || []).map((m) =>
      `${m.name}（${m.role || "成员"}，当前任务数：${m.task_count || 0}，擅长：${m.skills || "未设置"}）`
    ).join("\n");

    const taskList = tasks.map((t, i) =>
      `[${i}] 任务：${t.title}；描述：${t.description || "无"}；当前工作负责人：${t.work_assignee || "未分配"}；当前部门负责人：${t.dept_leader || "未分配"}`
    ).join("\n");

    console.log(`Batch matching ${tasks.length} tasks`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

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
              content: `你是一个任务分工助手。请为每项任务分别推荐工作负责人和部门负责人。

工作负责人【只能从工作负责人候选列表中选】，不得选择部长或副部长。考虑因素：技能匹配度、当前任务负载（优先分配给负载低的人）。
部门负责人【只能从部门负责人候选列表中选】。考虑因素：角色匹配度、当前任务负载。

返回一个 JSON 数组，格式为：
[{"taskIndex": 任务编号, "work_assignee": "工作负责人姓名", "dept_leader": "部门负责人姓名", "reason": "匹配理由"}]

规则：
1. 每个任务都要返回，即使原本已有负责人也可以重新评估
2. 工作负责人优先匹配技能相关（如"前端"任务匹配前端开发人员）
3. 部门负责人选择最相关的部长或副部长，不得从普通员工中选择
4. 优先分配给任务负载较低的成员
5. 如果找不到合适的，对应字段填 null
6. 只返回 JSON 数组，不要带任何 markdown 标记或解释文字`,
            },
            {
              role: "user",
              content: `任务列表：\n${taskList}\n\n部门负责人候选：\n${leaderList}\n\n工作负责人候选：\n${memberList}`,
            },
          ],
          max_tokens: 4000,
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
      return new Response(
        JSON.stringify({ assignments: [], warning: `AI API 返回错误 ${response.status}` }),
        { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    console.log(`Batch matching response: ${content.slice(0, 500)}`);

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const assignments = JSON.parse(jsonMatch[0]);
        return new Response(
          JSON.stringify({ assignments }),
          { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      } catch (parseErr) {
        console.error(`JSON parse error: ${parseErr.message}`);
        return new Response(
          JSON.stringify({ assignments: [], warning: "AI 返回格式异常", raw: content.slice(0, 500) }),
          { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ assignments: [], warning: "AI 返回格式异常", raw: content.slice(0, 500) }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    console.error(`Function error: ${err.message}`);
    return new Response(
      JSON.stringify({ assignments: [], error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});