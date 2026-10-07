'use client';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
type Catalog = { models: { id: string; name: string }[]; message: string };
export default function ModelPicker({ provider, configured, value, onChange }: { provider: 'codex' | 'openai'; configured: boolean; value: string; onChange: (model: string) => void }) {
  const [catalog, setCatalog] = useState<Catalog>({ models: [], message: '' });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setCatalog({ models: [], message: '' }); setQuery('');
    api<Catalog>('/settings/models?provider=' + provider, { signal: controller.signal }).then(setCatalog).catch(() => {
      if (!controller.signal.aborted) setCatalog({ models: [], message: '모델 목록을 불러오지 못했습니다.' });
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [provider, configured, retry]);
  const matches = catalog.models.filter(model => (model.name + ' ' + model.id).toLowerCase().includes(query.toLowerCase()));
  const options = [...matches];
  if (!options.some(model => model.id === value)) options.unshift({ id: value, name: value || '계정 기본 모델' });
  return <div className="model-picker">
    <label className="settings-field">모델<select aria-label="모델" value={value} disabled={loading} onChange={e => onChange(e.target.value)}>{options.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>
    <label className="settings-search model-search"><Search size={15} /><input aria-label="모델 검색" placeholder="모델 검색" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <p className="settings-help" role="status">{loading ? '사용 가능한 모델을 불러오는 중…' : query && !matches.length ? '검색 결과가 없습니다. 현재 선택한 모델을 유지합니다.' : catalog.message || `${catalog.models.length}개 옵션 · 다음 작업부터 적용됩니다.`}</p>
    {!loading && <button className="button" onClick={() => setRetry(retry + 1)}>목록 새로고침</button>}
  </div>;
}
