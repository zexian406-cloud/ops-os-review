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
  sku: { sku: string; msku?: string; store?: string };
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
      const adRatio = latestSnap.adRatio ?? 0;
      const prevAdRatio = previousSnap?.adRatio;
      pushFactor('adRatio', '广告费比', prevAdRatio, adRatio, adRatio > 0.3 ? 'up_bad' : 'neutral', '%');
      return {
        type,
        summary: `SKU ${sku.sku} 广告费比 ${(adRatio * 100).toFixed(1)}%，${adRatio > 0.3 ? '偏高需优化' : '正常'}`,
        suggestion: adRatio > 0.3 ? '优化关键词投放，降低 ACoS' : '维持当前广告策略',
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
    case 'return':
    case 'review': {
      const ret = latestSnap.returnRate ?? 0;
      const prevRet = previousSnap?.returnRate;
      pushFactor('returnRate', '退货率', prevRet, ret, ret > 0.1 ? 'up_bad' : 'neutral', '%');
      return {
        type,
        summary: `SKU ${sku.sku} 退货率 ${(ret * 100).toFixed(1)}%`,
        suggestion: ret > 0.1 ? '分析退货原因，优化产品描述或质量' : '退货率正常',
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
