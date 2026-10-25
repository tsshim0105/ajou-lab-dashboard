import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {fresh,visible,validateData,applyResearchChanges,applySharedData} from '../server/worker.mjs';
const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../paper-achievements.js',import.meta.url),'utf8'),ctx);const calc=a=>ctx.paCalculate({authors:6,sci:'SCI',role:'lead',percentile:20,include:true,...a});
test('university percentile tiers and author shares match supplied examples',()=>{
 assert.equal(calc({authors:7,percentile:1}).university,1000*1.5/7);
 for(const [pct,base] of [[1,1000],[1.01,600],[10,600],[10.01,450],[30,450],[30.01,360],[50,360],[50.01,300],[100,300]])assert.equal(calc({authors:1,percentile:pct}).university,base);
 assert.equal(calc({authors:4,percentile:10}).university,225);
 assert.ok(Math.abs(calc({authors:14,percentile:30}).university-450*1.5/14)<1e-10);
 assert.equal(calc({authors:2,percentile:50.1}).university,210);
 assert.equal(calc({authors:9,role:'co',percentile:1}).university,50);
 assert.equal(calc({authors:6,percentile:30}).university,112.5);
});
test('engineering contribution follows role and author count independently of IF',()=>{
 const lead=[300,240,210,180,150,120,120],co=[null,210,150,90,60,45,30];
 for(let n=1;n<=7;n++){assert.equal(calc({authors:n}).engineering,lead[n-1]);if(n>1)assert.equal(calc({authors:n,role:'co'}).engineering,co[n-1]);}
 assert.equal(calc({authors:32,role:'co',percentile:1}).engineering,30);
 assert.equal(calc({authors:14,percentile:30}).engineering,120);
});
test('unknown values stay unscored; excluded papers cannot inflate totals',()=>{
 for(const a of [{authors:null},{role:''},{sci:''},{percentile:null}])assert.equal(calc(a).university,null);
 assert.equal(calc({percentile:null}).engineering,120);assert.equal(calc({include:false}).university,null);assert.equal(calc({include:false}).excluded,true);
 assert.equal(calc({sci:'other',authors:1}).university,100);assert.equal(calc({sci:'other'}).engineering,null);
});
test('achievement metadata is professor-only, validated and preserved by student edits',()=>{
 const d=fresh().data,a={year:2026,authors:6,sci:'SCI',role:'lead',percentile:20,category:'Polymer Science',jcrYear:2025,include:true,note:'User verified'};
 d.papers.push({id:'p1',title:'Paper',journal:'Journal',year:2026,achievement:a});
 assert.equal(visible(d,false).papers[0].achievement,undefined);assert.deepEqual(visible(d,true).papers[0].achievement,a);assert.doesNotThrow(()=>validateData(d));
 const edited=applyResearchChanges(d,[{type:'papers',id:'p1',action:'edit',values:{title:'Revised'}}]);assert.deepEqual(edited.papers[0].achievement,a);
 assert.throws(()=>applyResearchChanges(d,[{type:'papers',id:'p1',action:'edit',values:{achievement:{}}}]));
 const shared=visible(d,false);shared.papers[0].achievement={note:'forged'};assert.deepEqual(applySharedData(d,shared).papers[0].achievement,a);
 for(const patch of [{percentile:101},{authors:0},{role:'bad'},{year:0},{include:'true'},{jcrYear:3000},{authors:1,role:'co'}]){const bad=structuredClone(d);Object.assign(bad.papers[0].achievement,patch);assert.throws(()=>validateData(bad));}
});

test('professor periods begin at 2024-2 and contain exactly ten consecutive semesters',()=>{
 assert.equal(ctx.paPeriodIndex(2024,1),-1);assert.equal(ctx.paPeriodIndex(2023,2),-1);
 assert.equal(ctx.paPeriodIndex(2024,2),0);assert.equal(ctx.paPeriodIndex(2029,1),0);
 assert.equal(ctx.paPeriodIndex(2029,2),1);assert.equal(ctx.paPeriodIndex(2034,1),1);
 assert.equal(ctx.paPeriodIndex(2034,2),2);assert.equal(ctx.paPeriodIndex(2039,1),2);
 assert.equal(ctx.paPeriodIndex(2026,null),null);
 for(let i=0;i<4;i++){const p=ctx.paPeriod(i);assert.equal(p.terms.length,10);assert.equal(p.terms[0].key,p.start);assert.equal(p.terms.at(-1).key,p.end);for(const t of p.terms)assert.equal(ctx.paPeriodIndex(t.year,t.semester),i);}
 assert.equal(ctx.paPeriod(0).label,'교수A');assert.equal(ctx.paPeriod(1).label,'교수B');assert.equal(ctx.paPeriod(2).label,'교수C');
});
test('year-only legacy records remain unassigned until a semester is confirmed',()=>{
 assert.equal(ctx.paTerm({year:2026}).semester,null);
 assert.equal(ctx.paTerm({year:2026,achievement:{year:2025,semester:2}}).year,2025);
 assert.equal(ctx.paTerm({year:2026,achievement:{year:2025,semester:2}}).semester,2);
 const d=fresh().data,a={year:2024,semester:2,authors:6,sci:'SCI',role:'lead',percentile:20,category:'',jcrYear:null,include:true,note:''};d.papers.push({id:'term-paper',year:2024,title:'Term paper',achievement:a});assert.doesNotThrow(()=>validateData(d));
 a.semester=3;assert.throws(()=>validateData(d));
});

test('screenshot base points score without inventing an exact IF percentile',()=>{
 assert.equal(calc({percentile:null,base:600}).university,150);
 const v=calc({percentile:null,base:450,engineeringRecorded:150});assert.equal(v.university,112.5);assert.equal(v.engineering,150);assert.equal(v.engineeringCalculated,120);assert.match(v.engineeringBasis,/차이 확인/);
});
test('publication issue date controls academic term; online date is not substituted',()=>{
 const a=ctx.paTerm({year:2024,onlineDate:'2024-07-30',issueDate:'2024-10-24'});assert.equal(a.year,2024);assert.equal(a.semester,2);
 assert.equal(ctx.paTerm({year:2025,issueDate:'2025-02-12'}).year,2024);
 assert.equal(ctx.paTerm({year:2024,issueDate:'2024-07-05'}).semester,1);
 assert.equal(ctx.paTerm({year:2025,onlineDate:'2025-01-01'}).semester,null);
});
test('batch import matches by DOI, preserves bibliography, and rejects unmatched or duplicate records',()=>{
 const papers=[{title:'Paper',doi:'10.example/test',issueDate:'2024-10-24',authorCount:9}],record={doi:'10.example/test',authors:8,role:'lead',base:450,note:'User spreadsheet'};
 const plan=ctx.paPrepareImport([record],papers);assert.equal(plan.length,1);assert.equal(plan[0].achievement.authors,8);assert.equal(plan[0].achievement.semester,2);assert.equal(papers[0].authorCount,9);
 assert.throws(()=>ctx.paPrepareImport([record,record],papers));assert.throws(()=>ctx.paPrepareImport([{...record,doi:'missing'}],papers));assert.throws(()=>ctx.paPrepareImport([record],[{...papers[0],issueDate:'2024-07-05'}]));
});
