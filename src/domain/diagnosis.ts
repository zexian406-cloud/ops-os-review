export interface DiagnosisFactor {
  key: string;
  label: string;
  before?: number | string;
  after?: number | string;
  delta?: number;
  unit?: string;
  impact?: 'up_good' | 'down_good' | 'up_bad' | 'down_bad' | 'neutral';
  note?: string;
}

export interface DiagnosisResult {
  type: string;
  summary: string;
  suggestion?: string;
  factors: DiagnosisFactor[];
}

interface DiagnosisInput {
  type: string;
  sku: { sku: string; msku?: string; store?: string; price?: number };
  latestSnap: {
    dailySales7d?: number;
    dailySales30d?: number;
    rating?: number;
    reviewCount?: number;
    adRatio?: number;
    returnRate?: number;
    refundRate?: number;
  };
  previousSnap?: {
    dailySales7d?: number;
    dailySales30d?: number;
    rating?: number;
    adRatio?: number;
    returnRate?: number;
    refundRate?: number;
  };
  latestInv?: {
    inStockTotal?: number;
    inStockEast?: number;
    inStockWest?: number;
  };
}

export function computeDiagnosis(input: DiagnosisInput): DiagnosisResult {
  const { type, sku, latestSnap, previousSnap, latestInv } = input;
  const factors: DiagnosisFactor[] = [];

  const pushFactor = (
    key: string,
    label: string,
    before: number | string | undefined,
    after: number | string | undefined,
    impact: DiagnosisFactor['impact'] = 'neutral',
    unit = '',
  ) => {
    const delta = typeof before === 'number' && typeof after === 'number' ? after - before : undefined;
    factors.push({ key, label, before, after, delta, unit, impact });
  };

  switch (type) {
    case 'stockout': {
      const stock = latestInv?.inStockTotal ?? 0;
      pushFactor('stock', '总库存', stock, stock, stock <= 0 ? 'down_bad' : 'neutral', '件');
      return {
        type,
        summary: `SKU ${sku.sku} 已断货，当前库存 ${stock} 件`,
        suggestion: stock <= 0 ? '立即安排补货，检查头程在途' : '监控库存变化',
        factors,
      };
    }
    case 'low_stock': {
      const stock = latestInv?.inStockTotal ?? 0;
      const sales = latestSnap.dailySales7d ?? 0;
      const coverDays = sales > 0 ? Math.floor(stock / sales) : 999;
      pushFactor('stock', '总库存', undefined, stock, 'neutral', '件');
      pushFactor('coverDays', '可售天数', undefined, coverDays, coverDays < 10 ? 'down_bad' : 'neutral', '天');
      return {
        type,
        summary: `SKU ${sku.sku} 库存偏低，可售 ${coverDays} 天`,
        suggestion: coverDays < 10 ? '建议补货，维持 30 天安全库存' : '关注库存变化',
        factors,
      };
    }
    case 'overstock': {
      const stock = latestInv?.inStockTotal ?? 0;
      pushFactor('stock', '总库存', undefined, stock, 'up_bad', '件');
      return {
        type,
        summary: `SKU ${sku.sku} 库存积压，当前 ${stock} 件`,
        suggestion: '考虑降价促销或站外推广清库',
        factors,
      };
    }
    case 'profit':
    case 'ad': {
      // 快照的 adRatio 已是百分数（46.46 = 46.46%），不再 ×100
      const adRatio = latestSnap.adRatio ?? 0;
      const prevAdRatio = previousSnap?.adRatio;
      pushFactor('adRatio', '广告费比', prevAdRatio, adRatio, adRatio > 30 ? 'up_bad' : 'neutral', '%');
      return {
        type,
        summary: `SKU ${sku.sku} 广告费比 ${adRatio.toFixed(1)}%，${adRatio > 30 ? '偏高需优化' : '正常'}`,
        suggestion: adRatio > 30 ? '优化关键词投放，降低 ACoS' : '维持当前广告策略',
        factors,
      };
    }
    case 'rating': {
      const rating = latestSnap.rating ?? 0;
      const prevRating = previousSnap?.rating;
      pushFactor('rating', '评分', prevRating, rating, rating < 4.0 ? 'down_bad' : 'neutral', '星');
      return {
        type,
        summary: `SKU ${sku.sku} 当前评分 ${rating.toFixed(1)} 星`,
        suggestion: rating < 4.0 ? '关注差评原因，改善产品或服务' : '维持高评分表现',
        factors,
      };
    }
    case 'return': {
      // 退款率为主口径；缺失时给出补数建议，不再回退到退货率
      const ret = latestSnap.refundRate;
      if (ret == null) {
        return {
          type,
          summary: `SKU ${sku.sku} 未导入退款率`,
          suggestion: '在运营数据表补填「退款率」后再诊断',
          factors,
        };
      }
      const prevRet = previousSnap?.refundRate;
      const price = sku.price ?? 0;
      const feeOf = (rate?: number) => (price > 0 && rate != null ? (rate / 100) * price : undefined);
      const curFee = feeOf(ret);
      const prevFee = feeOf(prevRet);
      const diff = prevRet == null ? null : ret - prevRet;
      // 三档归因：上升 / 持平（±0.5pt 内）/ 改善
      const tier = diff == null ? "single" : diff > 0.5 ? "up" : diff < -0.5 ? "down" : "flat";
      pushFactor('refundRate', '退款率', prevRet, ret, ret > 10 || tier === "up" ? 'up_bad' : tier === "down" ? 'down_bad' : 'neutral', '%');
      if (curFee != null) {
        pushFactor('refundFee', '单件退款损失', prevFee, curFee, (prevFee ?? 0) < curFee ? 'up_bad' : 'neutral', '$');
      }
      const feeText = curFee != null && prevFee != null
        ? `，单件退款损失 $${prevFee.toFixed(2)} → $${curFee.toFixed(2)}`
        : curFee != null ? `，单件退款损失 $${curFee.toFixed(2)}` : "";
      const summary = tier === "up"
        ? `SKU ${sku.sku} 退款率上升 ${prevRet!.toFixed(1)}% → ${ret.toFixed(1)}%${feeText}`
        : tier === "down"
          ? `SKU ${sku.sku} 退款率改善 ${prevRet!.toFixed(1)}% → ${ret.toFixed(1)}%${feeText}`
          : tier === "flat"
            ? `SKU ${sku.sku} 退款率持平 ${ret.toFixed(1)}%${feeText}`
            : `SKU ${sku.sku} 退款率 ${ret.toFixed(1)}%${feeText}`;
      const suggestion = tier === "up"
        ? ret > 10 ? '退款率上升，分析退款原因，核查产品质量与描述一致性' : '退款率上升，持续观察并排查近期变更'
        : tier === "down"
          ? '退款率改善，保持当前优化动作'
          : tier === "flat"
            ? '退款率持平，维持当前售后策略'
            : ret > 10 ? '分析退款原因，优化产品描述或质量' : '退款率正常';
      return { type, summary, suggestion, factors };
    }
    case 'review': {
      // returnRate 同样已是百分数（8 = 8%）
      const ret = latestSnap.returnRate ?? 0;
      const prevRet = previousSnap?.returnRate;
      pushFactor('returnRate', '退货率', prevRet, ret, ret > 10 ? 'up_bad' : 'neutral', '%');
      return {
        type,
        summary: `SKU ${sku.sku} 退货率 ${ret.toFixed(1)}%`,
        suggestion: ret > 10 ? '分析退货原因，优化产品描述或质量' : '退货率正常',
        factors,
      };
    }
    case 'listing': {
      const reviewCount = latestSnap.reviewCount ?? 0;
      pushFactor('reviewCount', '评论数', undefined, reviewCount, reviewCount < 50 ? 'down_bad' : 'neutral', '条');
      return {
        type,
        summary: `SKU ${sku.sku} 评论数 ${reviewCount} 条`,
        suggestion: reviewCount < 50 ? '关注早期评论积累' : '评论基础稳固',
        factors,
      };
    }
    default: {
      return {
        type,
        summary: `SKU ${sku.sku} 的 ${type} 类型诊断`,
        factors,
      };
    }
  }
}
