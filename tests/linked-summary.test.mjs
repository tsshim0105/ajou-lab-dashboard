import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../meeting-recording.js',import.meta.url),'utf8');
function context(){const c=vm.createContext({setInterval(){},window:{addEventListener(){}},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')});vm.runInContext(code,c);return c;}
test('linked summary renders three sections, keeps feedback under the right report and escapes content',()=>{
 const c=context();c.content='## 해야 할 일\n- [[학생:학생 A]] 반복 측정하기\n## 연구진행상황\n- [[주제:첫 실험]] 편차가 있음\n  - [[교수의견]] 조건 확인하기\n- [[주제:<img src=x>]] 두 번째 실험 완료됨\n  - [[교수의견]] 결과 비교하기\n## 교수 의견\n- 공통 기준 적용하기';
 const html=vm.runInContext('mrSummaryRendered(mrSummarySections(content))',c);
 assert.equal((html.match(/<section /g)||[]).length,3);assert.equal((html.match(/mr-linked-feedback/g)||[]).length,2);
 assert.ok(html.indexOf('반복 측정하기')<html.indexOf('첫 실험'));assert.ok(html.indexOf('조건 확인하기')<html.indexOf('두 번째 실험'));
 assert.doesNotMatch(html,/<img|\[\[|문제점 · 학생/);assert.match(html,/&lt;img/);
 const saved=vm.runInContext('mrSummaryContent(mrSummarySections(content))',c);c.content=saved;assert.equal(vm.runInContext('mrSummaryRendered(mrSummarySections(content))',c),html);
});
test('legacy problems and professor comments are preserved without invented links',()=>{
 const c=context();c.content='## 연구진행상황\n- 결과\n## 문제점 · 학생\n- 기포 발생\n## 개선점 · 교수\n- 탈기 조건 변경\n## 해야 할 일\n- 재측정';const html=vm.runInContext('mrSummaryRendered(mrSummarySections(content))',c);assert.match(html,/기포 발생/);assert.match(html,/탈기 조건 변경/);assert.doesNotMatch(html,/mr-linked-feedback/);
});
test('unmatched feedback remains visible and multi-part summaries keep their report associations',()=>{
 const c=context();c.content='## 연구진행상황\n- [[교수의견]] 연결 불명\n- [[주제:A]] A 보고\n- [[교수의견]] A 의견\n## 교수 의견\n- 공통\n## 연구진행상황\n- [[주제:B]] B 보고\n- [[교수의견]] B 의견';const html=vm.runInContext('mrSummaryRendered(mrSummarySections(content))',c);assert.match(html,/연결되지 않은 교수 의견/);assert.match(html,/연결 불명/);assert.ok(html.indexOf('A 의견')<html.indexOf('B 보고'));
});
test('generation contract uses report and directive endings with explicit role and link evidence',()=>{
 const server=readFileSync(new URL('../server/meeting-recording.mjs',import.meta.url),'utf8');for(const text of ['정확히 세 개','~계획임','~확인하기','[[교수의견]]','학생의 명시적인 실행 약속','화자가 불명확한 발언은 교수 댓글로 만들지'])assert.ok(server.includes(text));
});
