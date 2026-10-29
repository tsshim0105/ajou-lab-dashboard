import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const code=app.slice(app.indexOf('function upcomingGroupMeetings('),app.indexOf('function personalGroupMeetings('));
const rows=[{id:'today',date:'2026-10-29',kind:'논문발표',presenter:'학생',time:'15:00'}, {id:'next',date:'2026-11-12',kind:'랩세미나',presenter:'학생',time:'15:00'}];
const ctx=vm.createContext({savedGroupMeetings:()=>rows});vm.runInContext(code,ctx);
test('current meeting remains all day and rolls over at next Korea midnight',()=>{
 for(const iso of ['2026-10-29T00:00:00+09:00','2026-10-29T15:00:00+09:00','2026-10-29T23:59:59.999+09:00','2026-10-29T14:59:59.999Z'])assert.equal(ctx.upcomingGroupMeetings(new Date(iso))[0][6],'today');
 assert.equal(ctx.upcomingGroupMeetings(new Date('2026-10-30T00:00:00+09:00'))[0][6],'next');
 assert.equal(ctx.upcomingGroupMeetings(new Date('2026-11-13T00:00:00+09:00')).length,0);
 assert.equal(ctx.groupMeetingCountdown('2026-10-29',new Date('2026-10-29T23:59:00+09:00')),'오늘');
});
