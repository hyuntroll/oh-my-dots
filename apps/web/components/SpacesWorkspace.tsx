'use client';
import { useState } from 'react';
import { Download, File, FileText, FolderOpen, Image as ImageIcon, Loader2, Search, X } from 'lucide-react';
import Markdown from 'react-markdown';
export type FilePreview = { path: string; text?: string; loading?: boolean; error?: string };
type Artifact = { path: string; size: number };
function kind(path: string) { return /\.(png|jpe?g|gif|webp)$/i.test(path) ? 'images' : /\.(md|txt|csv|json|pdf|docx|xlsx|pptx|html)$/i.test(path) ? 'documents' : 'other'; }
function fileUrl(path: string, download = false) { return '/api/artifact-download/' + path.split('/').map(encodeURIComponent).join('/') + '?download=' + download; }
function size(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
export default function SpacesWorkspace({ files, preview, onFile, onClose }: { files: Artifact[]; preview: FilePreview | null; onFile: (path: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all');
  const matches = files.filter(file => file.path.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || kind(file.path) === filter));
  const selected = files.find(file => file.path === preview?.path);
  const image = preview && kind(preview.path) === 'images';
  const pdf = preview && /\.pdf$/i.test(preview.path);
  return <section className="spaces-workspace" aria-label="Spaces 생성 파일">
    <header className="spaces-heading"><FolderOpen size={20} /><strong>Spaces</strong><span>{files.length}개 파일</span><button className="icon-button" aria-label="Spaces 닫기" onClick={onClose}><X size={18} /></button></header>
    <div className="spaces-body"><aside className="spaces-library">
      <label className="settings-search"><Search size={15} /><input aria-label="파일 검색" placeholder="파일 검색" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="spaces-filters" aria-label="파일 종류">{[['all', '전체'], ['documents', '문서'], ['images', '이미지'], ['other', '기타']].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
      <p className="spaces-library-label">생성된 파일</p><div className="spaces-files">{matches.map(file => <button key={file.path} aria-current={preview?.path === file.path ? 'true' : undefined} onClick={() => onFile(file.path)}>{kind(file.path) === 'images' ? <ImageIcon size={19} /> : <FileText size={19} />}<span><strong>{file.path.split('/').pop()}</strong><small>{file.path} · {size(file.size)}</small></span></button>)}</div>
      {!matches.length && <p className="spaces-empty-list">{files.length ? '일치하는 파일이 없습니다.' : 'dot이 만든 파일이 여기에 모입니다.'}</p>}
    </aside><main className="spaces-document">
      {preview ? <><header className="spaces-document-heading"><FileText size={18} /><div><strong>{preview.path.split('/').pop()}</strong><small>{selected ? size(selected.size) : preview.path}</small></div><a className="icon-button" aria-label="파일 다운로드" title="다운로드" href={fileUrl(preview.path, true)}><Download size={18} /></a></header>
        <div className="spaces-preview">{image ? <img src={fileUrl(preview.path)} alt={preview.path.split('/').pop()} /> : pdf ? <iframe title={preview.path} src={fileUrl(preview.path)} /> : preview.loading ? <div className="spaces-empty"><Loader2 className="spin" size={26} /><p>파일을 여는 중…</p></div> : preview.error ? <div className="spaces-empty" role="alert"><File size={36} /><p>{preview.error}</p><button className="button" onClick={() => onFile(preview.path)}>다시 시도</button></div> : preview.text !== undefined ? /\.md$/i.test(preview.path) ? <article className="spaces-markdown"><Markdown>{preview.text}</Markdown></article> : <pre>{preview.text}</pre> : <div className="spaces-empty"><File size={40} /><h2>{preview.path.split('/').pop()}</h2><p>이 파일은 다운로드해서 열 수 있어요.</p><a className="button" href={fileUrl(preview.path, true)}><Download size={16} />파일 다운로드</a></div>}</div></> : <div className="spaces-empty"><FolderOpen size={40} /><h2>작업의 결과를 한곳에서</h2><p>{files.length ? '왼쪽에서 파일을 선택해 살펴보세요.' : '문서, 이미지, 자료를 만들면 여기에 표시됩니다.'}</p></div>}
    </main></div>
  </section>;
}
