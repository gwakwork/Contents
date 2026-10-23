#!/bin/bash
# Runs only on this Mac. Downloads the official, checksum-pinned Node runtime once.
set -euo pipefail
umask 077
MOA_PID=''
MOA_TEMP=''
cleanup() {
  if [ -n "$MOA_PID" ] && kill -0 "$MOA_PID" 2>/dev/null; then
    kill -TERM "$MOA_PID" 2>/dev/null || true
    wait "$MOA_PID" 2>/dev/null || true
  fi
  if [ -n "$MOA_TEMP" ]; then rm -rf -- "$MOA_TEMP"; fi
}
trap cleanup EXIT
trap 'exit 0' INT TERM
fail() { printf '\n%s\n' "$1"; printf '이 창의 안내를 확인한 뒤 Enter를 누르세요.\n'; read -r _ || true; exit 1; }
if [ "$(uname -s)" != 'Darwin' ]; then fail '이 실행 파일은 Mac용입니다.'; fi
MOA_OS_VERSION=$(/usr/bin/sw_vers -productVersion)
MOA_MAJOR=${MOA_OS_VERSION%%.*}
MOA_REST=${MOA_OS_VERSION#*.}
MOA_MINOR=${MOA_REST%%.*}
if [ "$MOA_MAJOR" -lt 13 ] || { [ "$MOA_MAJOR" -eq 13 ] && [ "$MOA_MINOR" -lt 5 ]; }; then
  fail 'macOS 13.5 이상이 필요합니다. Mac의 운영체제 버전을 확인해 주세요.'
fi
MOA_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd -- "$MOA_DIR"
MOA_SUPPORT="$HOME/Library/Application Support/MoaContentStudio"
MOA_NODE_VERSION='v24.22.1'
case "$(uname -m)" in
  arm64) MOA_ARCH='arm64'; MOA_SHA='89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7' ;;
  x86_64) MOA_ARCH='x64'; MOA_SHA='d132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035' ;;
  *) fail '이 Mac의 CPU 종류를 지원하지 않습니다.' ;;
esac
MOA_RUNTIME="$MOA_SUPPORT/runtime/$MOA_NODE_VERSION-$MOA_ARCH"
MOA_NODE="$MOA_RUNTIME/bin/node"
mkdir -p -- "$MOA_SUPPORT/runtime"
if [ ! -x "$MOA_NODE" ]; then
  printf '처음 실행 준비 중입니다. 공식 Node.js 실행 도구를 내려받습니다.\n'
  MOA_TEMP=$(mktemp -d "$MOA_SUPPORT/runtime/.download.XXXXXX")
  MOA_TAR="node-$MOA_NODE_VERSION-darwin-$MOA_ARCH.tar.gz"
  if ! /usr/bin/curl --fail --location --show-error --retry 2 --connect-timeout 20 --max-time 600 --proto '=https' --tlsv1.2 "https://nodejs.org/dist/$MOA_NODE_VERSION/$MOA_TAR" --output "$MOA_TEMP/$MOA_TAR"; then
    fail '실행 도구를 받지 못했어요. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.'
  fi
  MOA_ACTUAL=$(/usr/bin/shasum -a 256 "$MOA_TEMP/$MOA_TAR")
  MOA_ACTUAL=${MOA_ACTUAL%% *}
  if [ "$MOA_ACTUAL" != "$MOA_SHA" ]; then fail '실행 도구의 안전 확인에 실패했습니다. 다운로드 파일을 사용하지 않았어요.'; fi
  /usr/bin/tar -xzf "$MOA_TEMP/$MOA_TAR" -C "$MOA_TEMP"
  mv -- "$MOA_TEMP/node-$MOA_NODE_VERSION-darwin-$MOA_ARCH" "$MOA_RUNTIME"
  rm -rf -- "$MOA_TEMP"
  MOA_TEMP=''
fi
if ! "$MOA_NODE" --version >/dev/null 2>&1; then fail '실행 도구를 열지 못했어요. Mac의 보안 알림과 운영체제 버전을 확인해 주세요.'; fi
MOA_APP_VERSION=$("$MOA_NODE" -p "require('./package.json').version")
MOA_HEALTH=$(/usr/bin/curl --silent --max-time 2 http://127.0.0.1:3001/api/health || true)
case "$MOA_HEALTH" in
  *'"application":"moa-content-studio"'*'"ai":true'*'"version":"'"$MOA_APP_VERSION"'"'*)
    /usr/bin/open 'http://127.0.0.1:3001'
    printf '이미 실행 중인 Narrative를 열었어요. 종료할 때는 처음 실행했던 터미널 창에서 Control+C를 누르세요.\n'
    exit 0 ;;
esac
if /usr/sbin/lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  fail '다른 프로그램이나 이전 Narrative가 3001번 포트를 사용하고 있어요. 해당 프로그램을 종료한 뒤 다시 실행해 주세요.'
fi
printf '\nNarrative를 시작합니다.\n'
HOST='127.0.0.1' PORT='3001' DATA_PATH="$MOA_SUPPORT/studio.sqlite" "$MOA_NODE" server/index.mjs &
MOA_PID=$!
MOA_READY=''
for MOA_ATTEMPT in 1 2 3 4 5 6 7 8 9 10; do
  if ! kill -0 "$MOA_PID" 2>/dev/null; then fail '앱을 시작하지 못했어요. 위 오류 문구를 확인해 주세요.'; fi
  MOA_HEALTH=$(/usr/bin/curl --silent --max-time 2 http://127.0.0.1:3001/api/health || true)
  case "$MOA_HEALTH" in *'"application":"moa-content-studio"'*'"ai":true'*'"version":"'"$MOA_APP_VERSION"'"'*) MOA_READY='yes'; break ;; esac
  sleep 1
done
if [ "$MOA_READY" != 'yes' ]; then fail '앱 실행을 확인하지 못했어요. 위 오류 문구를 확인해 주세요.'; fi
/usr/bin/open 'http://127.0.0.1:3001'
printf '\n브라우저가 열렸어요. AI 작업실 → AI 연결 설정에서 API 키를 입력하세요.\n'
printf '사용하는 동안 이 터미널 창을 열어 두세요. 종료하려면 Control+C를 누르세요.\n'
wait "$MOA_PID"
