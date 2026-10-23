# NISML Hub for Android

v0.1.2 · Android 7.0 이상 · 인터넷 연결 필요.

## 0.1.1 실행 수정
홈 화면에서 다시 실행할 때 브라우저 화면을 제거할 수 있던 singleTask 설정을 standard로 변경했습니다. 작업 재사용은 Android Browser Helper의 LauncherActivity에 맡깁니다. 기존 0.1.0과 동일한 서명으로 업데이트합니다.
실제 기기에서는 최초 실행, 홈으로 나온 뒤 아이콘 한 번 누르기, 뒤로 종료 후 재실행, 최근 앱에서 복귀를 확인해야 합니다.

## 동작
- 연구실 로고 아이콘으로 https://nisml.ajou.ac.kr/dashboard/ 를 엽니다.
- Trusted Web Activity를 지원하는 브라우저에서는 도메인 검증 후 전체 화면으로 열립니다. 그 외에는 브라우저의 보안 주소 표시줄이 나타날 수 있습니다.
- OpenAI 로그인은 브라우저에서 진행합니다. 앱은 비밀번호·세션 쿠키·연구 데이터를 읽거나 별도로 저장하지 않습니다.
- 기존 사이트의 승인 계정·교수/학생 권한을 그대로 적용합니다.
- 외부 로그인 사이트에서는 주소 표시줄을 숨기지 않습니다.
- 사이트 내 알림 센터는 사용할 수 있습니다. 앱 종료 후의 Android 푸시 알림은 이 버전에 포함하지 않습니다.
- 앱 삭제가 브라우저 로그인까지 지우지는 않습니다. 공용 기기에서는 사이트에서 로그아웃하세요.

## 업데이트
웹 화면 변경은 다음 접속에 반영됩니다. APK 변경은 동일한 서명 키와 증가한 versionCode로 새 APK를 설치합니다. 설치 자체는 자동으로 강제하지 않습니다.
`release/NISML-Dashboard-X.Y.Z.apk`를 사이트 배포 시 최신 버전으로 연결합니다.

## 제작 및 검증
공식 Android SDK 약관은 사용자가 2026-10-16에 동의했습니다.
JDK 17, Gradle 8.13, Android SDK 36 / Build Tools 36.0.0 사용.
`bash scripts/build-release.sh`가 lint, release 빌드, 서명과 서명 검증을 수행합니다.
`release/assetlinks.json`을 사이트의 `/.well-known/assetlinks.json`에 배포해야 도메인이 앱을 신뢰합니다.
실제 Android 기기의 설치·로그인·TWA 표시 확인은 별도로 필요합니다.

## 서명 키 보관
`signing/`에 생성된 키와 암호는 배포/공개 저장소에 포함하지 않습니다. 같은 키가 있어야 기존 앱을 삭제하지 않고 업데이트할 수 있으므로 별도 보안 백업이 필요합니다. 이 폴더를 삭제하거나 재생성하지 마세요.

## 0.1.2 NISML Hub
홈 화면 앱 이름을 NISML Hub로 변경했습니다. 기존 패키지 식별자와 서명 키를 유지하며 versionCode 3으로 업데이트됩니다.
