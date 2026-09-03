import { useState } from 'react'
import type { Exhibit, HallId } from '../types'
import { halls } from '../data/halls'
import { useMuseumStore } from '../store/museumStore'

interface Props {
  defaultHall: HallId
  onClose: () => void
}

const emptyForm = {
  hall: 'antiquity' as HallId,
  categoryId: 'egypt',
  name: '',
  origin: '',
  era: '',
  date: '',
  location: '',
  collection: '',
  material: '',
  dimensions: '',
  description: '',
  tags: '',
  icon: '',
  imageUrl: '',
}

export default function AddExhibitModal({ defaultHall, onClose }: Props) {
  const addExhibit = useMuseumStore((s) => s.addExhibit)
  const [form, setForm] = useState({ ...emptyForm, hall: defaultHall })
  const [error, setError] = useState('')

  const activeHall = halls.find((h) => h.id === form.hall)!

  function set<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function switchHall(hallId: string) {
    const hall = halls.find((h) => h.id === hallId)!
    setForm((f) => ({
      ...f,
      hall: hallId as HallId,
      categoryId: hall.categories[0].id,
    }))
  }

  function submit() {
    if (!form.name.trim()) {
      setError('请填写展品名称')
      return
    }
    if (!form.description.trim()) {
      setError('请填写展品描述')
      return
    }

    const exhibit: Exhibit = {
      id: '',
      hall: form.hall,
      categoryId: form.categoryId,
      name: form.name.trim(),
      origin: form.origin.trim() || '未知',
      era: form.era.trim(),
      date: form.date.trim(),
      location: form.location.trim(),
      collection: form.collection.trim(),
      material: form.material.trim() || undefined,
      dimensions: form.dimensions.trim() || undefined,
      description: form.description.trim(),
      tags: form.tags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
      icon: form.icon.trim() || '🏛️',
      imageUrl: form.imageUrl.trim() || undefined,
      custom: true,
    }

    addExhibit(exhibit)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>录入新展品</h2>
        <p className="modal-sub">展品将保存在本地浏览器中，可随时增删与收藏。</p>

        <div className="form-group">
          <label>
            所属展馆 <span className="req">*</span>
          </label>
          <select value={form.hall} onChange={(e) => switchHall(e.target.value)}>
            {halls.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>
              展品名称 <span className="req">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="如：司母戊鼎"
            />
          </div>
          <div className="form-group">
            <label>分类</label>
            <select
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              {activeHall.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>国别 / 文明 / 领域</label>
            <input
              value={form.origin}
              onChange={(e) => set('origin', e.target.value)}
              placeholder="如：古埃及 / 英国"
            />
          </div>
          <div className="form-group">
            <label>时代 / 时期</label>
            <input
              value={form.era}
              onChange={(e) => set('era', e.target.value)}
              placeholder="如：商代 / 工业革命"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>年代</label>
            <input
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              placeholder="如：公元前 1200 年"
            />
          </div>
          <div className="form-group">
            <label>出土地 / 制造地</label>
            <input
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>现藏 / 所属机构</label>
            <input
              value={form.collection}
              onChange={(e) => set('collection', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>材质 / 技术</label>
            <input
              value={form.material}
              onChange={(e) => set('material', e.target.value)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>图标（emoji）</label>
            <input
              value={form.icon}
              onChange={(e) => set('icon', e.target.value)}
              placeholder="如：🏺"
            />
          </div>
          <div className="form-group">
            <label>图片 URL（可选）</label>
            <input
              value={form.imageUrl}
              onChange={(e) => set('imageUrl', e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="form-group">
          <label>尺寸 / 规格</label>
          <input
            value={form.dimensions}
            onChange={(e) => set('dimensions', e.target.value)}
            placeholder="如：高 133 cm"
          />
        </div>

        <div className="form-group">
          <label>
            描述 <span className="req">*</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="展品的历史、工艺或意义……"
          />
        </div>

        <div className="form-group">
          <label>标签（逗号分隔）</label>
          <input
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="如：青铜, 礼器, 商代"
          />
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>
            {error}
          </p>
        )}

        <div className="form-actions">
          <button className="btn-cancel" onClick={onClose}>
            取消
          </button>
          <button
            className="btn-submit"
            style={{ background: activeHall.theme.primary }}
            onClick={submit}
          >
            保存展品
          </button>
        </div>
      </div>
    </div>
  )
}
