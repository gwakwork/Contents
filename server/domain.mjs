const randomUUID = () => globalThis.crypto.randomUUID();

export const CHANNELS = ['website', 'instagram', 'threads'];
export const COLORS = ['sage', 'peach', 'lavender', 'sand', 'blue', 'rose'];
export const CHECKS = ['accuracy', 'rights', 'channels'];
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
function text(value, max, label, required = false) {
  if (typeof value !== 'string') throw new AppError(`${label} 형식이 올바르지 않아요.`);
  const result = value.trim();
  if (required && !result) throw new AppError(`${label}을 입력해 주세요.`);
  if (result.length > max)
    throw new AppError(`${label}은 ${max.toLocaleString()}자 이내로 입력해 주세요.`);
  return result;
}
export function validateFields(input) {
  const title = text(input.title, 160, '제목', true);
  const body = text(input.body ?? '', 100000, '본문');
  const excerpt = text(input.excerpt ?? '', 300, '요약');
  if (
    !Array.isArray(input.channels) ||
    input.channels.length === 0 ||
    input.channels.some((c) => !CHANNELS.includes(c))
  ) {
    throw new AppError('발행할 채널을 하나 이상 선택해 주세요.');
  }
  if (!COLORS.includes(input.color)) throw new AppError('표지 색상을 선택해 주세요.');
  const variants = {};
  for (const channel of ['instagram', 'threads']) {
    variants[channel] = text(
      input.variants?.[channel] ?? '',
      channel === 'instagram' ? 2200 : 500,
      '채널별 원고',
    );
  }
  return {
    title,
    body,
    excerpt,
    channels: [...new Set(input.channels)],
    color: input.color,
    variants,
  };
}
export function addEvent(content, action, message, at = new Date().toISOString()) {
  return {
    ...content,
    history: [...content.history, { id: randomUUID(), action, message, at }],
    updatedAt: at,
  };
}
export function createContent(input, isExample = false) {
  const now = new Date().toISOString();
  const content = {
    ...validateFields(input),
    id: randomUUID(),
    status: 'draft',
    revision: 1,
    isExample,
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    approval: null,
    history: [],
  };
  return addEvent(content, 'created', '새 콘텐츠를 작성했어요.', now);
}
export function updateContent(content, input) {
  const fields = validateFields(input);
  const changed = Object.keys(fields).some(
    (key) => JSON.stringify(fields[key]) !== JSON.stringify(content[key]),
  );
  if (!changed) return content;
  return addEvent(
    { ...content, ...fields, status: 'draft', approval: null, approvedAt: null },
    'edited',
    content.status === 'draft'
      ? '원고를 수정했어요.'
      : '원고가 변경되어 다시 작성 중으로 돌아왔어요. 재검토가 필요해요.',
  );
}
function assertReviewable(content) {
  if (!content.body.trim()) throw new AppError('검토를 요청하려면 본문을 작성해 주세요.');
  for (const channel of content.channels) {
    const copy = channel === 'website' ? content.body : content.variants[channel] || content.body;
    const limit = channel === 'instagram' ? 2200 : channel === 'threads' ? 500 : 100000;
    if (copy.length > limit)
      throw new AppError(
        `${channel === 'instagram' ? '인스타그램' : 'Threads'} 원고를 ${limit}자 이내로 준비해 주세요. 채널별 원고에서 따로 작성할 수 있어요.`,
      );
  }
}
export function transition(content, input) {
  if (input.action === 'submit') {
    if (!['draft', 'changes'].includes(content.status))
      throw new AppError('작성 중이거나 수정 요청된 글만 검토를 요청할 수 있어요.', 409);
    assertReviewable(content);
    return addEvent(
      { ...content, status: 'review', approvedAt: null, approval: null },
      'submitted',
      '검토를 요청했어요.',
    );
  }
  if (input.action === 'approve') {
    if (content.status !== 'review')
      throw new AppError('검토 대기 중인 글만 승인할 수 있어요.', 409);
    assertReviewable(content);
    if (!CHECKS.every((key) => input.checks?.[key] === true))
      throw new AppError('세 가지 검토 항목을 모두 확인해 주세요.');
    const at = new Date().toISOString();
    return addEvent(
      {
        ...content,
        status: 'approved',
        approvedAt: at,
        approval: {
          checks: Object.fromEntries(CHECKS.map((key) => [key, true])),
          revision: content.revision + 1,
          at,
        },
      },
      'approved',
      '검토를 마치고 최종 승인했어요. 채널 연결 후 발행할 수 있어요.',
      at,
    );
  }
  if (input.action === 'request_changes') {
    if (content.status !== 'review')
      throw new AppError('검토 대기 중인 글만 수정 요청할 수 있어요.', 409);
    const message = text(input.message ?? '', 3000, '수정 의견', true);
    return addEvent(
      { ...content, status: 'changes', approvedAt: null, approval: null },
      'changes_requested',
      message,
    );
  }
  if (input.action === 'note') {
    return addEvent(content, 'note', text(input.message ?? '', 3000, '검토 의견', true));
  }
  throw new AppError('지원하지 않는 작업이에요.');
}
export function publicationEnvelope(content) {
  if (content.status !== 'approved' || !content.approval)
    throw new AppError('최종 승인된 콘텐츠만 내보낼 수 있어요.', 409);
  return {
    schemaVersion: 1,
    contentId: content.id,
    revision: content.revision,
    approvedAt: content.approvedAt,
    title: content.title,
    excerpt: content.excerpt,
    targets: content.channels.map((channel) => ({
      channel,
      title: content.title,
      body: channel === 'website' ? content.body : content.variants[channel] || content.body,
    })),
  };
}
