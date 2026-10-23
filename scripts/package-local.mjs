import { cpSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';

renameSync('release/index.html', 'release/narrative-local.html');
// Preserve the original file URL and its browser storage for existing users.
cpSync('release/narrative-local.html', 'release/moa-local.html');
const instructions = `Narrative · 오프라인 원고 관리\n\n1. narrative-local.html을 Chrome 또는 Edge로 여세요.\n2. 작성 → 저장 → 검토 요청 → 확인 항목 체크 → 최종 승인 순서로 사용합니다.\n3. 원고는 이 브라우저에 저장됩니다. 브라우저 데이터를 지우기 전에 백업하세요.\n4. 화면의 백업 저장/가져오기로 다른 컴퓨터나 버전으로 옮길 수 있습니다.\n5. AI 각색은 narrative-mac.zip 실행 버전에서 사용할 수 있습니다.\n6. 실제 웹사이트·SNS 업로드는 추후 연결합니다.\n\n이전 moa-local.html은 같은 위치에서 계속 사용할 수 있습니다. 파일 이름·위치·브라우저를 바꾸기 전에는 백업을 저장하세요.\n`;
writeFileSync('release/처음 읽어주세요.txt', instructions);
for (const name of ['narrative-local', 'moa-local']) {
  writeFileSync(
    `release/${name}.zip`,
    zipSync({
      [`${name}.html`]: new Uint8Array(readFileSync(`release/${name}.html`)),
      '처음 읽어주세요.txt': strToU8(
        instructions.replaceAll('narrative-local.html', `${name}.html`),
      ),
    }),
  );
}
console.log('Narrative offline HTML and ZIP created. Original download filenames preserved.');
