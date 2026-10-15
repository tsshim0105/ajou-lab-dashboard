import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const code=app.slice(app.indexOf('const groupMeetingDates='),app.lastIndexOf("document.addEventListener('click',event=>"));
const ctx=vm.createContext({esc:String,table:()=>'',badge:String});vm.runInContext(code,ctx);
test('schedule rolls over exactly at 15:00 Korea time and handles exhaustion',()=>{
 const upcoming=iso=>ctx.upcomingGroupMeetings(new Date(iso));
 assert.equal(upcoming('2026-10-15T22:00:00+09:00').length,9);
 assert.equal(upcoming('2026-10-29T14:59:59+09:00')[0][2],'오치영');
 assert.equal(upcoming('2026-10-29T15:00:00+09:00')[0][0],'2026-11-12');
 assert.equal(upcoming('2027-02-18T15:00:00+09:00').length,0);
 assert.match(ctx.groupMeetingCards(new Date('2027-02-19')),/등록된 일정 없음/);
 assert.equal(ctx.groupMeetingCountdown('2026-10-29',new Date('2026-10-28T15:00:00Z')),'오늘');
});
