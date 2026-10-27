#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
export JAVA_HOME="$ROOT/tooling/jdk/Contents/Home"
export ANDROID_HOME="$ROOT/tooling/sdk"
export GRADLE_USER_HOME="$ROOT/tooling/gradle-cache"
export PATH="$JAVA_HOME/bin:$ROOT/tooling/gradle-8.13/bin:$PATH"
VERSION=0.1.5
FINAL="$ROOT/release/NISML-Hub-$VERSION.apk"
[ ! -e "$FINAL" ] || { echo 'Release exists; increment versionName, versionCode and VERSION.' >&2; exit 1; }
gradle --no-daemon :app:assembleRelease :app:lintRelease
umask 077
mkdir -p signing release
if [ ! -e signing/release.jks ]; then
 python3 -c 'import secrets,pathlib; pathlib.Path("signing/password").write_text(secrets.token_urlsafe(48))'
 keytool -genkeypair -keystore signing/release.jks -storetype JKS -storepass:file signing/password -keypass:file signing/password -alias nisml -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=NISML Dashboard, OU=Research Laboratory, O=NISML, C=KR'
fi
TOOLS="$ANDROID_HOME/build-tools/36.0.0"
"$TOOLS/zipalign" -P 16 -f -v 4 app/build/outputs/apk/release/app-release-unsigned.apk app/build/outputs/apk/release/aligned.apk > /dev/null
"$TOOLS/apksigner" sign --ks signing/release.jks --ks-key-alias nisml --ks-pass file:signing/password --out "$FINAL" app/build/outputs/apk/release/aligned.apk
"$TOOLS/apksigner" verify --verbose --print-certs "$FINAL" > release/signature.txt
python3 - <<'PY'
import json,re,pathlib
s=pathlib.Path('release/signature.txt').read_text()
h=re.search(r'certificate SHA-256 digest: ([a-fA-F0-9]+)',s).group(1).upper()
fingerprint=':'.join(h[i:i+2] for i in range(0,len(h),2))
pathlib.Path('release/assetlinks.json').write_text(json.dumps([{'relation':['delegate_permission/common.handle_all_urls'],'target':{'namespace':'android_app','package_name':'kr.ac.ajou.nisml.dashboard','sha256_cert_fingerprints':[fingerprint]}}],indent=2)+'\n')
PY
echo "Signed APK: $FINAL"
