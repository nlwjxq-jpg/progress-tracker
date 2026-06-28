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
    const { tasks, apiUrl, apiKey } = body;

    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ error: "无任务数据" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    const year = now.getFullYear();

    const keyTasks = tasks.filter(t => t.is_key);
    const dailyTasks = tasks.filter(t => !t.is_key);

    function hasContent(t) {
      return !!(t.title || t.last_month_progress || t.last_month_target || t.this_month_target || t.q1_target || t.q2_target || t.q3_target || t.q4_target);
    }

    const keyWithContent = keyTasks.filter(hasContent);
    const dailyWithContent = dailyTasks.filter(hasContent);

    if (keyWithContent.length === 0 && dailyWithContent.length === 0) {
      return new Response(JSON.stringify({ error: "选中的任务均无任何记录，请先填写任务内容" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    let taskSummary = `## ${year}年度工作任务汇总\n\n`;
    taskSummary += `共 ${tasks.length} 项任务，其中重点任务 ${keyWithContent.length} 项、日常任务 ${dailyWithContent.length} 项。\n\n`;

    if (keyWithContent.length > 0) {
      taskSummary += "### 一、重点任务\n\n";
      keyWithContent.forEach((t, i) => {
        taskSummary += `${i + 1}. 任务名称：${t.title}\n`;
        if (t.assessment_target) taskSummary += `   考核目标：${t.assessment_target}\n`;
        taskSummary += `   当前进度：${t.progress || 0}% | 状态：${t.status === "completed" ? "已完成" : t.status === "in_progress" ? "进行中" : "待开始"}\n`;
        if (t.q1_target) taskSummary += `   一季度目标：${t.q1_target}\n`;
        if (t.q2_target) taskSummary += `   二季度目标：${t.q2_target}\n`;
        if (t.q3_target) taskSummary += `   三季度目标：${t.q3_target}\n`;
        if (t.q4_target) taskSummary += `   四季度目标：${t.q4_target}\n`;
        if (t.last_month_target) taskSummary += `   上月工作目标：${t.last_month_target}\n`;
        if (t.last_month_progress) taskSummary += `   上月工作进展：${t.last_month_progress}\n`;
        if (t.this_month_target) taskSummary += `   本月工作目标：${t.this_month_target}\n`;
        taskSummary += "\n";
      });
    }

    if (dailyWithContent.length > 0) {
      taskSummary += "### 二、日常任务\n\n";
      dailyWithContent.forEach((t, i) => {
        taskSummary += `${i + 1}. 任务名称：${t.title}\n`;
        if (t.assessment_target) taskSummary += `   考核目标：${t.assessment_target}\n`;
        taskSummary += `   当前进度：${t.progress || 0}% | 状态：${t.status === "completed" ? "已完成" : t.status === "in_progress" ? "进行中" : "待开始"}\n`;
        if (t.q1_target) taskSummary += `   一季度目标：${t.q1_target}\n`;
        if (t.q2_target) taskSummary += `   二季度目标：${t.q2_target}\n`;
        if (t.q3_target) taskSummary += `   三季度目标：${t.q3_target}\n`;
        if (t.q4_target) taskSummary += `   四季度目标：${t.q4_target}\n`;
        if (t.last_month_progress) taskSummary += `   上月进展：${t.last_month_progress}\n`;
        if (t.this_month_target) taskSummary += `   本月目标：${t.this_month_target}\n`;
        taskSummary += "\n";
      });
    }

    const aiKey = apiKey || Deno.env.get("DEEPSEEK_API_KEY") || "";
    const finalApiUrl = apiUrl || Deno.env.get("DEEPSEEK_API_URL") || "https://api.deepseek.com/v1/chat/completions";

    const aiResp = await fetch(finalApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + aiKey },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `你是一名专业的机关单位文秘人员。请根据提供的${year}年度工作任务数据，撰写一份正式的全年度工作总结报告。当前日期是${dateStr}。

严格遵循以下要求：
1. 采用正式公文格式，语言庄重、条理清晰、表达精准
2. 标题为"${year}年度工作总结"，居中
3. 正文分段结构：
   一、年度工作总体情况（简短概述全年任务数量、重点/日常分类、总体完成态势）
   二、重点工作任务完成情况（逐项展开重点任务，基于季度目标和进展，突出工作站位和成效）
   三、日常工作任务推进情况（概括日常任务，分类归纳）
   四、存在的主要问题与不足（根据进度未完成、逾期等合理分析，不凭空编造）
   五、下一年度工作思路与重点方向（基于本年任务延续性，提出前瞻性计划）
4. 各段小标题对仗工整，文字有力
5. 每项任务基于提供的数据来撰写，大意保持一致，不可脱离原文编造
6. 只用已有数据撰写，没有信息的地方不胡乱编造
7. 文中不要出现星号(*)标记、不要出现markdown格式符号
8. 在报告最末尾单独一行标注"报告生成日期：${dateStr}"`
          },
          { role: "user", content: taskSummary }
        ],
        temperature: 0.5,
        max_tokens: 4000
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
