'use client';
import { useEffect, useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from '../lib/api';

type Skill = { id: string; title: string; description: string; version: string };
type LoadedSkill = Skill & { content: string; sha256: string };

function SkillCard({ skill }: { skill: Skill }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<LoadedSkill | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true); setError(false);
    try { setContent(await api<LoadedSkill>(`/skills/${encodeURIComponent(skill.id)}`)); }
    catch { setError(true); } finally { setLoading(false); }
  };
  return <section className="settings-card skill-card">
    <header><BookOpen size={20} /><h2>{skill.title}</h2><span className="settings-badge">내장 · v{skill.version}</span></header>
    <p className="settings-help">{skill.description}</p>
    <button className="skill-expand" aria-expanded={open} aria-controls={`skill-${skill.id}`} onClick={() => { setOpen(!open); if (!open && !content && !loading) void load(); }}>작업 절차 보기 <ChevronDown size={15} /></button>
    {open && <div id={`skill-${skill.id}`} className="skill-content">
      {loading && <p role="status">설명서를 불러오는 중…</p>}
      {error && <p role="alert">불러오지 못했습니다. <button className="button" onClick={() => void load()}>다시 시도</button></p>}
      {content && <><ReactMarkdown>{content.content}</ReactMarkdown><small className="skill-version">내용 버전 · {content.sha256.slice(0, 12)}</small></>}
    </div>}
  </section>;
}

export default function SkillsCatalog() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    api<{ skills: Skill[] }>('/skills').then(result => { if (!disposed) { setSkills(result.skills); setError(false); } }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; };
  }, [attempt]);
  return <div className="settings-cards"><section className="settings-card"><h2>필요할 때 꺼내 쓰는 작업 설명서</h2><p className="settings-help">OhMyDots가 짧은 목록에서 작업에 맞는 스킬을 고르고, 필요한 절차만 읽어 활용합니다. 어떤 절차를 참고했는지는 대화의 작업 기록에서 확인할 수 있어요.</p><span className="settings-badge">읽기 전용</span></section>
    {error ? <p role="alert">스킬 목록을 불러오지 못했습니다. <button className="button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button></p> : !skills ? <p role="status">스킬을 불러오는 중…</p> : skills.map(skill => <SkillCard key={skill.id} skill={skill} />)}
  </div>;
}
