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
    const { tasks, month, apiUrl, apiKey } = body;

    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ error: "无任务数据" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const monthLabel = month === "last" ? "上月" : "当月";
    
    const keyTasks = tasks.filter(t => t.is_key);
    const dailyTasks = tasks.filter(t => !t.is_key);
    
    let taskSummary = `## ${monthLabel}工作任务汇总\n\n`;
    
    if (keyTasks.length > 0) {
      taskSummary += "### 重点任务\n\n";
      keyTasks.forEach((t, i) => {
        taskSummary += `${i + 1}. ${t.title}\n`;
        taskSummary += `   进度: ${t.progress}% | 状态: ${t.status}\n`;
        if (month === "last" && t.last_month_progress) taskSummary += `   上月进展: ${t.last_month_progress}\n`;
        if (month === "last" && t.last_month_target) taskSummary += `   上月目标: ${t.last_month_target}\n`;
        if (month === "current" && t.this_month_target) taskSummary += `   本月目标: ${t.this_month_target}\n`;
        if (month === "current" && t.last_month_progress) taskSummary += `   上月进展: ${t.last_month_progress}\n`;
        taskSummary += "\n";
      });
    }
    
    if (dailyTasks.length > 0) {
      taskSummary += "### 日常任务\n\n";
      dailyTasks.forEach((t, i) => {
        taskSummary += `${i + 1}. ${t.title} | 进度: ${t.progress}% | 状态: ${t.status}\n`;
        if (month === "last" && t.last_month_progress) taskSummary += `   进展: ${t.last_month_progress}\n`;
        if (month === "current" && t.this_month_target) taskSummary += `   目标: ${t.this_month_target}\n`;
        taskSummary += "\n";
      });
    }

    const aiKey = apiKey || Deno.env.get("DEEPSEEK_API_KEY") || "";
    const aiResp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + aiKey },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `你是一名专业的机关单位文秘人员。请根据提供的${monthLabel}工作任务数据，撰写一份正式的工作月报。\n\n要求：\n1. 采用公文格式，语言正式、条理清晰、表达准确\n2. 标题为"${monthLabel}工作月报"，居中\n3. 分段结构：一、重点工作进展 / 二、日常工作完成情况 / 三、存在问题与困难 / 四、下步工作计划\n4. 各段小标题对仗工整\n5. 每项任务用一句话概括进展，避免罗列\n6. 文中不要出现星号(*)标记\n7. 结尾标注报告生成日期`
          },
          { role: "user", content: taskSummary }
        ],
        temperature: 0.7,
        max_tokens: 3000
      })
    });

    const text = await aiResp.text();
    let aiData;
    try {
      aiData = JSON.parse(text);
    } catch {
      throw new Error("AI返回格式异常: " + text.slice(0, 200));
    }

    if (!aiResp.ok) throw new Error(aiData.error?.message || "AI调用失败, 状态码:" + aiResp.status);

    const report = aiData.choices?.[0]?.message?.content || "报告生成失败";

    return new Response(JSON.stringify({ report }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
