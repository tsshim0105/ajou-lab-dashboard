import test from 'node:test';import assert from 'node:assert/strict';
import {recordScheduleAdditions,recordScheduleDay} from '../server/schedule-notifications.mjs';
test('schedule additions include both kinds, do not notify unchanged edits, and day reminders use Korea date once',()=>{
 const data={groupMeetings:[{id:'a',date:'2026-10-19',kind:'랩세미나',time:'15:00',presenter:'Student',location:'Room'}],gameNights:[{month:'2026-10',date:'2026-10-19',game:'Game'}]};const state={data};
 recordScheduleAdditions(state,{},data,'Student');assert.equal(state.notifications.length,2);
 recordScheduleAdditions(state,data,data,'Student');assert.equal(state.notifications.length,2);
 assert.equal(recordScheduleDay(state,new Date('2026-10-18T14:59:00Z')),false);
 assert.equal(recordScheduleDay(state,new Date('2026-10-18T15:00:00Z')),true);assert.equal(state.notifications.length,4);
 assert.equal(recordScheduleDay(state,new Date('2026-10-19T10:00:00Z')),false);
 assert.equal(recordScheduleDay(state,new Date('2026-10-19T15:00:00Z')),false);
 assert.equal(state.notifications[0].type,'groupMeetings');
});
