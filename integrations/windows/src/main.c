#ifndef UNICODE
#define UNICODE
#endif
#define _UNICODE
#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <wchar.h>

/* This launcher delegates authentication, permissions and rendering to Edge.
   It never reads browser data and accepts no externally supplied URLs. */
static BOOL edgePath(wchar_t *out) {
 const wchar_t *vars[]={L"ProgramFiles(x86)",L"ProgramFiles",L"LOCALAPPDATA"};
 for(int i=0;i<3;i++) {
  wchar_t root[MAX_PATH];DWORD n=GetEnvironmentVariableW(vars[i],root,MAX_PATH);
  if(!n||n>=MAX_PATH)continue;
  if(_snwprintf(out,MAX_PATH,L"%ls\\Microsoft\\Edge\\Application\\msedge.exe",root)<0)continue;
  DWORD attr=GetFileAttributesW(out);
  if(attr!=INVALID_FILE_ATTRIBUTES&&!(attr&FILE_ATTRIBUTE_DIRECTORY))return TRUE;
 }
 return FALSE;
}
int WINAPI wWinMain(HINSTANCE instance,HINSTANCE previous,PWSTR command,int show) {
 (void)instance;(void)previous;(void)command;(void)show;
 wchar_t edge[MAX_PATH];
 if(!edgePath(edge)) {
  MessageBoxW(NULL,L"NISML Hub를 실행하려면 Microsoft Edge가 필요합니다.\nMicrosoft 공식 홈페이지에서 Edge를 설치한 뒤 다시 실행해주세요.",L"NISML Hub",MB_OK|MB_ICONINFORMATION);
  return 1;
 }
 SHELLEXECUTEINFOW run={sizeof(run)};run.fMask=SEE_MASK_FLAG_NO_UI;run.lpVerb=L"open";run.lpFile=edge;
 run.lpParameters=L"--app=https://nisml.tsshim.chatgpt.site/dashboard/";run.nShow=SW_SHOWNORMAL;
 if(!ShellExecuteExW(&run)) {
  MessageBoxW(NULL,L"NISML Hub를 열지 못했습니다. Microsoft Edge가 정상적으로 실행되는지 확인해주세요.",L"NISML Hub",MB_OK|MB_ICONERROR);return 2;
 }
 return 0;
}
