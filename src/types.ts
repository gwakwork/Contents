export type Status = 'draft' | 'review' | 'changes' | 'approved';
export type Channel = 'website' | 'instagram' | 'threads';
export type Color = 'sage' | 'peach' | 'lavender' | 'sand' | 'blue' | 'rose';
export interface ContentFields {
  title: string;
  body: string;
  excerpt: string;
  channels: Channel[];
  color: Color;
  variants: { instagram: string; threads: string };
}
export interface Content extends ContentFields {
  id: string;
  status: Status;
  revision: number;
  isExample: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approval: { checks: Record<string, boolean>; revision: number; at: string } | null;
  history: { id: string; action: string; message: string; at: string }[];
}
export const STATUSES: Record<Status, { label: string; description: string }> = {
  draft: { label: '작성 중', description: '아이디어를 자유롭게 다듬어요' },
  review: { label: '검토 대기', description: '발행 전 꼼꼼히 확인해 주세요' },
  changes: { label: '수정 요청', description: '검토 의견을 반영해 주세요' },
  approved: { label: '승인 완료', description: '검토를 마친 콘텐츠예요' },
};
export const CHANNEL_NAMES: Record<Channel, string> = {
  website: '웹사이트',
  instagram: '인스타그램',
  threads: 'Threads',
};
export const COLORS: Color[] = ['sage', 'peach', 'lavender', 'sand', 'blue', 'rose'];
export const EMPTY: ContentFields = {
  title: '',
  body: '',
  excerpt: '',
  channels: ['website'],
  color: 'sage',
  variants: { instagram: '', threads: '' },
};
