import { AppError, addEvent, validateFields } from './domain.mjs';

const date = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function createBackup(contents) {
  return {
    format: 'moa-content-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    contents,
  };
}
export function validateBackup(backup) {
  if (
    !backup ||
    backup.format !== 'moa-content-backup' ||
    backup.version !== 1 ||
    !Array.isArray(backup.contents) ||
    backup.contents.length > 10000
  )
    throw new AppError('모아에서 내려받은 JSON 백업 파일을 선택해 주세요.');
  const ids = new Set();
  return backup.contents.map((c) => {
    if (
      !c ||
      typeof c.id !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(c.id) ||
      ids.has(c.id) ||
      !Number.isInteger(c.revision) ||
      c.revision < 1 ||
      !['draft', 'review', 'changes', 'approved'].includes(c.status) ||
      typeof c.isExample !== 'boolean' ||
      !date(c.createdAt) ||
      !date(c.updatedAt) ||
      !Array.isArray(c.history) ||
      c.history.length > 10000 ||
      c.history.some(
        (event) =>
          !event ||
          typeof event.id !== 'string' ||
          !['created', 'edited', 'submitted', 'approved', 'changes_requested', 'note'].includes(
            event.action,
          ) ||
          typeof event.message !== 'string' ||
          event.message.length > 3000 ||
          !date(event.at),
      )
    )
      throw new AppError('백업의 콘텐츠 정보가 올바르지 않아요. 원본 파일을 확인해 주세요.');
    const fields = validateFields(c);
    if (c.status === 'approved') {
      if (
        !c.approval ||
        !date(c.approvedAt) ||
        c.approval.at !== c.approvedAt ||
        !Number.isInteger(c.approval.revision) ||
        c.approval.revision < 1 ||
        c.approval.revision > c.revision ||
        !['accuracy', 'rights', 'channels'].every((key) => c.approval.checks?.[key] === true)
      )
        throw new AppError('백업의 승인 기록이 올바르지 않아요.');
    } else if (c.approval !== null || c.approvedAt !== null)
      throw new AppError('백업의 검토 상태가 올바르지 않아요.');
    let aiSource;
    if (c.aiSource !== undefined) {
      const s = c.aiSource;
      if (
        !s ||
        typeof s.generationId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(s.generationId) ||
        typeof s.source !== 'string' ||
        s.source.length > 20000 ||
        typeof s.instructions !== 'string' ||
        s.instructions.length > 6001 ||
        !['aida', 'pas', 'information', 'story', 'custom'].includes(s.formula) ||
        typeof s.model !== 'string' ||
        s.model.length > 100 ||
        !date(s.createdAt)
      )
        throw new AppError('백업의 AI 원문 정보가 올바르지 않아요.');
      aiSource = {
        generationId: s.generationId,
        source: s.source,
        instructions: s.instructions,
        formula: s.formula,
        model: s.model,
        createdAt: s.createdAt,
      };
    }
    ids.add(c.id);
    return {
      ...fields,
      id: c.id,
      revision: c.revision,
      status: c.status,
      isExample: c.isExample,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      approvedAt: c.approvedAt,
      approval: c.approval,
      history: c.history,
      ...(aiSource ? { aiSource } : {}),
    };
  });
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function mergeBackup(existing, incoming) {
  const currentById = new Map(existing.map((c) => [c.id, c]));
  const additions = [];
  const summary = { added: 0, copies: 0, skipped: 0 };
  for (const content of incoming) {
    const current = currentById.get(content.id);
    if (current && JSON.stringify(canonical(current)) === JSON.stringify(canonical(content))) {
      summary.skipped++;
      continue;
    }
    if (current) {
      additions.push(
        addEvent(
          {
            ...content,
            id: crypto.randomUUID(),
            title: content.title.slice(0, 150) + ' (복원본)',
            status: 'draft',
            revision: content.revision + 1,
            approval: null,
            approvedAt: null,
          },
          'edited',
          '현재 원고를 보존하고 백업을 별도 복원본으로 가져왔어요. 기존 검토 이력은 보관하며 복원본은 다시 검토해 주세요.',
        ),
      );
      summary.copies++;
    } else {
      additions.push(content);
      summary.added++;
    }
  }
  return { additions, summary };
}
