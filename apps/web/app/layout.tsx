import type { Metadata } from 'next';
import './globals.css';
import './computer-workspace.css';
export const metadata: Metadata = { title: 'OhMyDots · 나의 컴퓨터 에이전트', description: '대화하며 함께 사용하는 개인 AI 컴퓨터' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
