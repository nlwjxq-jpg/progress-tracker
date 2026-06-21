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
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    
    const keyTasks = tasks.filter(t => t.is_key);
    const dailyTasks = tasks.filter(t => !t.is_key);

    function hasContent(t) {
      if (month === "last") return !!(t.last_month_progress || t.last_month_target);
      return !!(t.this_month_target || t.last_month_progress);
    }

    const keyWithContent = keyTasks.filter(hasContent);
    const dailyWithContent = dailyTasks.filter(hasContent);
    
    let taskSummary = `## ${monthLabel}工作任务汇总\n\n`;
    taskSummary += `共 ${tasks.length} 项任务，其中 ${keyWithContent.length + dailyWithContent.length} 项有 ${monthLabel}工作记录。\n\n`;
    
    if (keyWithContent.length > 0) {
      taskSummary += "### 重点任务\n\n";
      keyWithContent.forEach((t, i) => {
        taskSummary += `${i + 1}. ${t.title}\n`;
        taskSummary += `   当前进度: ${t.progress}% | 状态: ${t.status === "completed" ? "已完成" : t.status === "in_progress" ? "进行中" : "待开始"}\n`;
        if (month === "last") {
          if (t.last_month_target) taskSummary += `   上月确定的工作目标: ${t.last_month_target}\n`;
          if (t.last_month_progress) taskSummary += `   上月实际工作进展: ${t.last_month_progress}\n`;
        } else {
          if (t.last_month_progress) taskSummary += `   上月工作进展: ${t.last_month_progress}\n`;
          if (t.this_month_target) taskSummary += `   本月确定的工作目标: ${t.this_month_target}\n`;
        }
        taskSummary += "\n";
      });
    }
    
    if (dailyWithContent.length > 0) {
      taskSummary += "### 日常任务\n\n";
      dailyWithContent.forEach((t, i) => {
        taskSummary += `${i + 1}. ${t.title}\n`;
        taskSummary += `   当前进度: ${t.progress}% | 状态: ${t.status === "completed" ? "已完成" : t.status === "in_progress" ? "进行中" : "待开始"}\n`;
        if (month === "last" && t.last_month_progress) taskSummary += `   进展: ${t.last_month_progress}\n`;
        if (month === "current" && t.this_month_target) taskSummary += `   目标: ${t.this_month_target}\n`;
        taskSummary += "\n";
      });
    }

    if (keyWithContent.length === 0 && dailyWithContent.length === 0) {
      return new Response(JSON.stringify({ error: `选中的任务均无${monthLabel}工作记录，请先填写进展/目标` }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
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
            content: `你是一名专业的机关单位文秘人员。请根据提供的${monthLabel}工作任务数据，撰写一份正式的工作月报。当前日期是${dateStr}。\n\n严格遵循以下要求：\n1. 采用公文格式，语言正式、条理清晰、表达准确\n2. 标题为"${monthLabel}工作月报"，居中\n3. 分段结构：一、重点工作进展 / 二、日常工作完成情况 / 三、存在问题与困难 / 四、下步工作计划\n4. 各段小标题对仗工整\n5. 每项任务基于提供的"上月实际工作进展"或"本月确定的工作目标"内容来撰写，大意保持一致，不可脱离原文编造\n6. 如果某项任务没有进展或目标内容，则该项任务不出现在报告中\n7. 只用提供的"上月实际工作进展"来撰写"一、重点工作进展"和"二、日常工作完成情况"\n8. 只用提供的"本月确定的工作目标"来撰写"四、下步工作计划"\n9. "三、存在问题与困难"根据任务进度（未完成、进度低等）合理概括，不要凭空编造具体问题\n10. 文中不要出现星号(*)标记\n11. 在报告最末尾单独一行标注"报告生成日期：${dateStr}"`
          },
          { role: "user", content: taskSummary }
        ],
        temperature: 0.5,
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

    let report = aiData.choices?.[0]?.message?.content || "报告生成失败";

    // Ensure date is appended
    if (!report.includes(dateStr)) {
      report += `\n\n报告生成日期：${dateStr}`;
    }

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
