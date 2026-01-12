/**
 * 统一日期解析与格式化工具
 */

/**
 * 将各种格式的日期字符串转换为标准的 YYYY-MM-DD 格式
 * 专门处理 RSS/Atom 中常见的日期格式 (RFC 822, ISO 8601 等)
 */
export function parseAndFormatDate(dateStr: string): string {
  if (!dateStr) return getTodayStr();

  // 预清洗：去除星期、具体时间、时区信息、多余空格
  // 例如: "Wed, 02 Oct 2024 15:00:00 +0000" -> "02 Oct 2024"
  let cleanStr = dateStr
    .replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*/i, '') // 去除星期
    .replace(/\d{1,2}:\d{2}(:\d{2})?.*$/, '')           // 去除时间及之后的内容
    .trim();

  try {
    // 1. 尝试原生 Date 解析
    const d = new Date(cleanStr);
    if (!isNaN(d.getTime())) {
      // 额外检查：如果年份太离谱（比如解析成了 1970 或 2001），尝试正则
      if (d.getFullYear() > 1990) {
        return formatDate(d);
      }
    }

    // 2. 针对常见非标准格式的手动正则提取 (例如: 2024.10.01, 2024/10/01, 01-10-2024)
    // 匹配 YYYY-MM-DD
    const ymdMatch = dateStr.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (ymdMatch) {
      const [_, y, m, d] = ymdMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // 匹配 DD-MM-YYYY 或 DD/MM/YYYY
    const dmyMatch = dateStr.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
    if (dmyMatch) {
      const [_, d, m, y] = dmyMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // 3. 处理一些特殊的中文格式 (例如: 2024年10月01日)
    const cnMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (cnMatch) {
      const [_, y, m, d] = cnMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // 4. 如果还是不行，尝试再次用原始字符串解析一次
    const finalTry = new Date(dateStr);
    if (!isNaN(finalTry.getTime())) {
      return formatDate(finalTry);
    }

    return getTodayStr();
  } catch (e) {
    console.error('Date parsing failed for:', dateStr, e);
    return getTodayStr();
  }
}

/**
 * 格式化 Date 对象为 YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 获取当前日期的标准格式
 */
export function getTodayStr(): string {
  return formatDate(new Date());
}
