import { FORMULAS } from '../../server/ai.mjs';
export function responseFor(value) {
  const stages = FORMULAS.find((f) => f.id === value.formula).stages;
  return {
    title: '함께 읽는 수요일',
    excerpt: '동네에서 무료로 만나는 독서 모임',
    body: '독서 모임을 찾고 계신가요?\n\n매주 수요일, 동네에서 함께 책을 읽어요. 참가비는 없습니다.\n\n수요일에 함께해 주세요.',
    instagram: value.channels.includes('instagram')
      ? '수요일에는 함께 책을 읽어요. 무료 동네 독서 모임입니다.'
      : '',
    threads: value.channels.includes('threads')
      ? '함께 읽는 수요일. 참가비 없는 동네 독서 모임에 함께해 주세요.'
      : '',
    changes: ['모임 정보를 독자의 관심을 끄는 순서로 정리했어요.'],
    reviewNotes: ['정확한 장소와 참가 방법은 직접 확인해 주세요.'],
    formulaSteps: (stages.length ? stages : ['공감', '안내']).map((stage) => ({
      stage,
      summary: `${stage}에 맞게 모임 정보를 배치했어요.`,
    })),
  };
}
export function envelope(result) {
  return {
    status: 'completed',
    model: 'gpt-4.1-mini-test',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }],
    usage: { input_tokens: 123, output_tokens: 456 },
  };
}
