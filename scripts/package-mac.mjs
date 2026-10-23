import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';

const temporary = mkdtempSync(join(tmpdir(), 'moa-mac-package-'));
try {
  for (const name of ['package.json', 'package-lock.json']) cpSync(name, join(temporary, name));
  execFileSync(
    'npm',
    [
      'ci',
      '--omit=dev',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--cache',
      process.env.npm_config_cache || join(tmpdir(), 'moa-npm-cache'),
    ],
    { cwd: temporary, stdio: 'inherit' },
  );
  for (const name of ['dist', 'server']) cpSync(name, join(temporary, name), { recursive: true });
  cpSync('scripts/start-mac.command', join(temporary, '시작.command'));
  writeFileSync(
    join(temporary, '처음 읽어주세요.txt'),
    `Narrative · Mac용\n\nmacOS 13.5 이상, Apple Silicon/Intel Mac을 지원합니다.\n기존 버전이 실행 중이라면 해당 터미널에서 Control+C로 종료한 뒤 시작하세요. 기존 원고와 API 키는 유지됩니다.\n\n1. 이 폴더를 원하는 곳에 두고 '시작.command'를 더블클릭하세요.\n2. 처음 한 번은 공식 Node.js 실행 도구를 자동으로 받습니다. 직접 설치할 필요는 없습니다.\n3. 브라우저가 열리면 'AI 작업실' → 'AI 연결 설정'을 누르세요.\n4. OpenAI에서 발급한 API 키를 넣고 저장하세요. ChatGPT 구독과 API 사용료는 별도입니다.\n5. 원문을 붙여 넣고 AIDA, PAS, 정보 전달형 등의 공식을 고르세요.\n6. 'AI로 각색하기'를 누르면 실제 OpenAI API에 요청합니다. 인터넷 연결과 사용 가능한 API 잔액이 필요합니다.\n7. 결과를 확인하고 '이 결과를 검토함으로 보내기'를 누르세요. 원고 수정과 체크리스트 확인 후 직접 승인합니다.\n8. 사용하는 동안 터미널 창은 열어 두세요. 종료할 때 터미널에서 Control+C를 누르세요.\n\nMac이 실행을 막으면 시스템 설정 → 개인정보 보호 및 보안에서 안내를 확인하세요. 신뢰하는 이 파일만 개별적으로 허용하세요. 보안 기능 전체를 끄지 마세요.\n실행 권한만 없다는 오류이면 터미널에서 bash 뒤에 공백을 넣고 '시작.command' 파일을 끌어 넣어 Enter를 누를 수 있습니다.\n\n저장 위치: ~/Library/Application Support/MoaContentStudio/\n원고, AI 작업 기록, 설정은 프로그램 폴더와 따로 보관하므로 새 버전으로 바꿔도 유지됩니다.\nAPI 키는 위 폴더의 ai-settings.json에 현재 사용자만 읽고 쓸 수 있는 권한으로 보관합니다. 암호화 저장은 아닙니다. 키 파일을 공유하지 마세요.\n'백업 저장' 파일에는 저장한 원고, 검토 이력, 채택한 AI 원문만 들어갑니다. API 키와 아직 검토함으로 보내지 않은 AI 작업은 포함되지 않습니다.\n전체 데이터를 옮기려면 앱을 정상 종료하고 위 폴더를 별도로 보관하세요. 키가 포함되므로 안전하게 관리하세요.\n\n이전 moa-local.html의 글 옮기기: 이전 화면에서 '백업 저장' → 새 화면에서 '백업 가져오기'.\n실제 웹사이트·SNS 업로드 연결은 추후 추가합니다.\n\n검증: Linux 클라우드에서 빌드·API·브라우저 흐름·압축 실행 구성을 검사했습니다. 실제 Mac 더블클릭 실행과 개인 API 키로 생성은 별도 확인이 필요합니다.\n`,
  );
  const files = {};
  function collect(directory, prefix = '') {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (name === '.bin') continue;
      const relative = prefix ? `${prefix}/${name}` : name;
      if (statSync(path).isDirectory()) collect(path, relative);
      else
        files[`Narrative-Mac/${relative}`] = [
          new Uint8Array(readFileSync(path)),
          { os: 3, attrs: (relative === '시작.command' ? 0o100755 : 0o100644) << 16 },
        ];
    }
  }
  collect(temporary);
  mkdirSync('release', { recursive: true });
  const archive = zipSync(files, { level: 6 });
  writeFileSync('release/narrative-mac.zip', archive);
  writeFileSync('release/moa-ai-mac.zip', archive); // Existing download links remain valid.
  writeFileSync(
    'release/AI-Mac-사용방법.txt',
    strToU8(readFileSync(join(temporary, '처음 읽어주세요.txt'), 'utf8')),
  );
  console.log(
    'Mac AI package created: release/narrative-mac.zip (runtime downloaded from nodejs.org on first launch).',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
