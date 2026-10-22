import { createContent, transition } from './domain.mjs';

export function createExampleContents() {
  const entries = [
    {
      title: '덜어낼수록 선명해지는 일상의 기록',
      excerpt: '바쁜 하루 속, 나에게 중요한 것을 발견하는 작은 연습.',
      body: '무언가를 더하기보다 덜어내는 일이 필요한 순간이 있어요.\n\n책상 위 물건 하나, 빽빽한 일정 하나를 비워보세요. 남겨진 공간에서 나에게 정말 중요한 것들이 조금씩 보이기 시작합니다.\n\n오늘은 어떤 것을 덜어내고 싶으신가요? 여러분만의 작은 실천을 기록해 보세요.',
      channels: ['website', 'instagram'],
      color: 'sage',
      state: 'review',
    },
    {
      title: '작은 루틴이 만드는 커다란 변화',
      excerpt: '매일 10분, 나를 돌보는 가장 다정한 방법.',
      body: '아침에 일어나 물 한 잔을 마시고, 창문을 열어 바람을 맞이해요.\n\n하루를 바꾸는 건 커다란 결심보다 작고 반복 가능한 습관일지도 몰라요. 나만의 속도로 새로운 루틴을 만들어 보세요.\n\n#작은습관 #일상의기록 #나만의루틴',
      channels: ['instagram', 'threads'],
      color: 'peach',
      state: 'draft',
    },
    {
      title: '우리 브랜드가 가을을 맞이하는 방법',
      excerpt: '계절의 색을 담은 새로운 이야기.',
      body: '익숙한 풍경이 새로운 빛으로 물드는 계절입니다.\n\n이번 가을, 우리는 자연에서 발견한 차분한 색과 오래 곁에 둘 수 있는 이야기를 준비했어요. 서두르지 않고, 하나씩 소개할게요.\n\n새로운 계절에도 함께해 주세요.',
      channels: ['website', 'instagram'],
      color: 'lavender',
      state: 'approved',
    },
    {
      title: '좋아하는 것을 오래 좋아하기 위해',
      excerpt: '지속 가능한 취향에 대한 짧은 생각.',
      body: '마음에 드는 물건을 발견하면, 오래 사용할 장면을 떠올려요.\n\n쉽게 바꾸기보다 돌보고 고치는 선택. 그 작은 선택들이 일상에 단단한 취향을 만들어 준다고 믿어요.\n\n여러분은 어떤 것을 오래 좋아하고 있나요?',
      channels: ['website'],
      color: 'sand',
      state: 'changes',
    },
    {
      title: '영감은 생각보다 가까운 곳에',
      excerpt: '걷다가, 멈추다가 발견한 이번 주의 영감.',
      body: '매일 지나던 골목에서 새로운 장면을 발견했어요. 담장 위 그림자, 오래된 간판의 글씨, 작은 가게의 창문.\n\n익숙한 길에서도 시선을 조금 바꾸면 새로운 이야기가 보여요. 이번 주에는 휴대폰을 잠시 넣고 주변을 둘러보세요.',
      channels: ['instagram'],
      color: 'blue',
      state: 'review',
    },
    {
      title: '이번 달, 함께 나누고 싶은 이야기',
      excerpt: '우리의 생각을 모아 다음 이야기를 준비해요.',
      body: '이번 달에는 어떤 이야기를 나누면 좋을까요?\n\n마음에 남았던 순간, 새롭게 배운 것, 함께 고민하고 싶은 질문을 천천히 적어보려고 해요.\n\n아직은 다듬는 중인 작은 아이디어입니다.',
      channels: ['website', 'threads'],
      color: 'rose',
      state: 'draft',
    },
  ];
  return entries.map((entry, index) => {
    let content = createContent({ ...entry, variants: {} }, true);
    if (entry.state !== 'draft')
      content = { ...transition(content, { action: 'submit' }), revision: 2 };
    if (entry.state === 'approved')
      content = {
        ...transition(content, {
          action: 'approve',
          checks: { accuracy: true, rights: true, channels: true },
        }),
        revision: 3,
      };
    if (entry.state === 'changes')
      content = {
        ...transition(content, {
          action: 'request_changes',
          message: '독자가 실천할 수 있는 구체적인 예시를 한 가지 더 넣어 주세요.',
        }),
        revision: 3,
      };
    const time = new Date(Date.now() - index * 3600000).toISOString();
    return { ...content, updatedAt: time };
  });
}
