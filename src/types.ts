// 展品与展馆的类型定义

// 展馆：古物馆 / 工业科学馆 / 自然科学馆 / 金融博物馆
export type HallId = 'antiquity' | 'industry' | 'nature' | 'finance'

export interface Hall {
  id: HallId
  name: string
  subtitle: string
  description: string
  // 主题色，用于 UI 装饰
  theme: {
    primary: string
    secondary: string
    gradient: string
    accent: string
  }
  // 该展馆下的分类
  categories: Category[]
}

export interface Category {
  id: string
  name: string
  description: string
  // 分类下展品的默认符号/氛围
  icon: string
}

export interface Exhibit {
  id: string
  hall: HallId
  categoryId: string
  name: string
  // 所属文明 / 国别 / 时代（古物）或 领域/发明者（工业）
  origin: string
  era: string
  // 年份或时间段（如「公元前 196 年」「1769」）
  date: string
  // 出土地 / 制造地 / 产地
  location: string
  // 现藏 / 所属机构
  collection: string
  // 尺寸 / 规格
  dimensions?: string
  // 材质 / 技术
  material?: string
  // 描述
  description: string
  // 标签
  tags: string[]
  // 视觉符号（emoji）—— 作为可靠的离线视觉占位
  icon: string
  // 可选外部图片 URL（用户添加时可用）
  imageUrl?: string
  // 详情页大图（爬取数据提供更高分辨率）
  imageLarge?: string
  // 数据来源机构（如「大都会艺术博物馆」）
  source?: string
  // 展品原页面链接（标注出处）
  sourceUrl?: string
  // 是否为用户自定义展品
  custom?: boolean
}

export type View =
  | { name: 'home' }
  | { name: 'hall'; hallId: HallId }
  | { name: 'detail'; exhibitId: string }
