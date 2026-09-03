import type { Hall } from '../types'

// 两大展馆定义
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
      { id: 'americas', name: '美洲古文明', description: '玛雅、阿兹特克与印加', icon: '🗿' },
      { id: 'south-asia', name: '南亚与印度河', description: '印度河流域与孔雀王朝', icon: '🦁' },
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
]

export const hallMap: Record<string, Hall> = Object.fromEntries(
  halls.map((h) => [h.id, h]),
)

export function getCategory(hallId: string, categoryId: string) {
  const hall = hallMap[hallId]
  return hall?.categories.find((c) => c.id === categoryId)
}
