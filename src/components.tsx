import { useEffect, useRef } from 'react';
import { Check, Globe2, Instagram, X } from 'lucide-react';
import { CHANNEL_NAMES, STATUSES, type Channel, type Color, type Status } from './types';

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M8 25V7l16 18V7" />
        </svg>
      </span>
      {!small && <span>Narrative</span>}
    </div>
  );
}
export function ChannelIcon({ channel, size = 15 }: { channel: Channel; size?: number }) {
  return channel === 'website' ? (
    <Globe2 size={size} />
  ) : channel === 'instagram' ? (
    <Instagram size={size} />
  ) : (
    <span className="threads-icon" style={{ fontSize: size + 2 }} aria-hidden="true">
      @
    </span>
  );
}
export function ChannelBadges({ channels }: { channels: Channel[] }) {
  return (
    <div className="channel-badges">
      {channels.map((channel) => (
        <span key={channel} title={CHANNEL_NAMES[channel]}>
          <ChannelIcon channel={channel} />
          {CHANNEL_NAMES[channel]}
        </span>
      ))}
    </div>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge ${status}`}>
      <i />
      {STATUSES[status].label}
    </span>
  );
}
export function Cover({
  color,
  title,
  compact = false,
}: {
  color: Color;
  title?: string;
  compact?: boolean;
}) {
  return (
    <div className={`cover cover-${color} ${compact ? 'compact' : ''}`} aria-hidden="true">
      <span className="cover-initial">{title?.trim().slice(0, 1) || 'N'}</span>
      <div className="cover-rule" />
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      closeRef.current();
    };
    node.addEventListener('cancel', cancel);
    return () => {
      node.removeEventListener('cancel', cancel);
      node.close();
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="닫기" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function StepFlow({ status }: { status?: Status }) {
  const position = status === 'approved' ? 3 : status === 'review' || status === 'changes' ? 1 : 0;
  return (
    <div className="step-flow">
      {['콘텐츠 작성', '내가 직접 검토', '최종 승인', '채널에 발행'].map((label, index) => (
        <div
          key={label}
          className={`${index <= position ? 'reached' : ''} ${index === 3 ? 'future' : ''}`}
        >
          <span>{index < position ? <Check size={12} /> : index + 1}</span>
          <b>{label}</b>
          {index < 3 && <i />}
          {index === 3 && <small>연결 예정</small>}
        </div>
      ))}
    </div>
  );
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}
export function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
