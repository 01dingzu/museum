import type { Hall } from '../types'

// 三大展馆定义
export const halls: Hall[] = [
  {
    id: 'antiquity',
    name: '古物馆',
    subtitle: '跨越六千年的文明瑰宝',
    description:
      '从尼罗河畔到黄河之滨，从两河流域到安第斯高原，汇集世界各大古文明的青铜、石刻、金器与典籍。',
    theme: {
      primary: '#9a6a3a',
      secondary: '#d8b98a',
      gradient: 'linear-gradient(135deg, #f8f0e2 0%, #ecdcbe 100%)',
      accent: '#b8860b',
    },
    categories: [
      { id: 'egypt', name: '古埃及', description: '法老、金字塔与尼罗河文明', icon: '🐫' },
      { id: 'mesopotamia', name: '两河流域', description: '苏美尔、巴比伦与楔形文字', icon: '🏺' },
      { id: 'greek-roman', name: '古希腊罗马', description: '哲学、艺术与古典雕塑', icon: '🏛️' },
      { id: 'china', name: '中国文物', description: '青铜、陶俑与千年文明', icon: '🐉' },
      { id: 'south-asia', name: '南亚与印度河', description: '印度河流域与孔雀王朝', icon: '🦁' },
      { id: 'americas', name: '美洲古文明', description: '玛雅、阿兹特克与印加', icon: '🗿' },
      { id: 'islamic', name: '伊斯兰与中东', description: '波斯、阿拉伯与伊斯兰艺术', icon: '🕌' },
      { id: 'east-asia', name: '东亚与东南亚', description: '日本、朝鲜与东南亚文明', icon: '⛩️' },
      { id: 'africa-oceania', name: '非洲与大洋洲', description: '撒哈拉以南与太平洋岛民', icon: '🪘' },
    ],
  },
  {
    id: 'industry',
    name: '工业科学馆',
    subtitle: '重塑世界的发明与工程',
    description:
      '从蒸汽机的第一声轰鸣到登月舱的着陆，收录改变人类命运的动力、能源、通信与计算里程碑。',
    theme: {
      primary: '#3d5a80',
      secondary: '#98c1d9',
      gradient: 'linear-gradient(135deg, #eef4f9 0%, #d7e6f0 100%)',
      accent: '#293241',
    },
    categories: [
      { id: 'industrial-revolution', name: '工业革命', description: '纺机、蒸汽与钢铁时代', icon: '🏭' },
      { id: 'power-machinery', name: '动力与机械', description: '内燃机与工业母机', icon: '⚙️' },
      { id: 'transport', name: '交通', description: '汽车、机车与飞行', icon: '🚂' },
      { id: 'communication', name: '通信与信息', description: '电报、电话与无线电', icon: '📡' },
      { id: 'energy-electric', name: '能源与电气', description: '发电机、电灯与电磁', icon: '⚡' },
      { id: 'computing-space', name: '计算机与航天', description: '电子计算与太空时代', icon: '🚀' },
    ],
  },
  {
    id: 'nature',
    name: '自然科学馆',
    subtitle: '地球与生命的亿万年纪录',
    description:
      '从恐龙化石到珍稀矿物，从陨石到动植物标本，收录地球 46 亿年演化与生命多样性的实证。',
    theme: {
      primary: '#2d6a4f',
      secondary: '#95d5b2',
      gradient: 'linear-gradient(135deg, #edf7f0 0%, #d8f3dc 100%)',
      accent: '#1b4332',
    },
    categories: [
      { id: 'paleontology', name: '古生物与恐龙', description: '恐龙、化石与远古生命', icon: '🦖' },
      { id: 'minerals-gems', name: '矿物与宝石', description: '晶体、宝石与岩石', icon: '💎' },
      { id: 'meteorites', name: '陨石与宇宙', description: '陨石、太空岩石与行星科学', icon: '☄️' },
      { id: 'botany', name: '植物标本', description: '植物、菌类与藻类', icon: '🌿' },
      { id: 'zoology', name: '动物标本', description: '哺乳动物、鸟类与昆虫', icon: '🦋' },
      { id: 'anthropology', name: '人类起源', description: '人类学与史前文明', icon: '🦴' },
    ],
  },
  {
    id: 'finance',
    name: '金融博物馆',
    subtitle: '从贝壳到数字货币的财富史',
    description:
      '从吕底亚第一枚金币到现代纸币，从古罗马钱币到勋章奖章，收录货币、铸币、票据与金融工具的千年演进。',
    theme: {
      primary: '#8a6d1d',
      secondary: '#e0c56a',
      gradient: 'linear-gradient(135deg, #faf3dc 0%, #f0e2a8 100%)',
      accent: '#6b5310',
    },
    categories: [
      { id: 'ancient-coins', name: '古代钱币', description: '希腊、罗马与古代文明铸币', icon: '🪙' },
      { id: 'currency', name: '货币与铸币', description: '各国货币与流通铸币', icon: '💰' },
      { id: 'banknotes', name: '纸币', description: '纸钞、票据与信用凭证', icon: '💵' },
      { id: 'medals-orders', name: '勋章与奖章', description: '荣誉勋章与纪念奖章', icon: '🏅' },
      { id: 'commemorative', name: '纪念币与金币', description: '纪念币、金银币与特种铸币', icon: '🎖️' },
      { id: 'financial-tools', name: '金融工具', description: '算盘、天平、收银机与储钱', icon: '⚖️' },
    ],
  },
]

export const hallMap: Record<string, Hall> = Object.fromEntries(
  halls.map((h) => [h.id, h]),
)

export function getCategory(hallId: string, categoryId: string) {
  const hall = hallMap[hallId]
  return hall?.categories.find((c) => c.id === categoryId)
}
