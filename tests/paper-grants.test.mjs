import test from 'node:test';import assert from 'node:assert/strict';
import {applyPaperGrants,cleanGrantNumbers,paperGrantCatalog} from '../server/paper-grants.mjs';
test('exact unique matches replace existing descriptions and intentional blanks once',()=>{
 const catalog=[{doi:'10.1234/test',title:'A Paper',awards:['RS‐2024‐00397807','RS-2024-00397807'],source:'https://api.crossref.org/works/10.1234/test'}];
 const data={papers:[{id:'1',title:'Changed title',doi:'10.1234/test'},{id:'2',title:'A-paper'},{id:'3',title:'A Paper',fund:'Manual grant'},{id:'4',title:'A Paper',fund:'',paperEditedFields:['fund']},{id:'5',title:'Unrelated'}],funds:[{private:true}]};
 const result=applyPaperGrants(data,catalog);assert.equal(result.count,4);assert.equal(result.data.papers[0].fund,'RS-2024-00397807');assert.equal(result.data.papers[2].fund,'RS-2024-00397807');assert.equal(result.data.papers[3].fund,'RS-2024-00397807');assert.equal(result.data.papers[4].fund,undefined);assert.deepEqual(result.data.funds,data.funds);assert.equal(data.papers[0].fund,undefined);assert.equal(applyPaperGrants(result.data,catalog).count,0);
 assert.equal(applyPaperGrants({papers:[{title:'A Paper'}]},[...catalog,...catalog]).count,0);
});
test('catalog has source evidence and valid grant identifiers',()=>{assert.ok(paperGrantCatalog.length===31);for(const r of paperGrantCatalog){assert.match(r.source,/^https:\/\//);assert.ok(cleanGrantNumbers(r.awards).length);}});

test('a conflicting DOI cannot match an unrelated title',()=>{assert.equal(applyPaperGrants({papers:[{title:paperGrantCatalog[0].title,doi:'10.1234/unrelated'}]}).count,0);});

test('subsequent manual corrections survive the replacement migration',()=>{const first=applyPaperGrants({papers:[{title:paperGrantCatalog[0].title,fund:'Project title',paperEditedFields:['fund']}]});first.data.papers[0].fund='Corrected grant';const next=applyPaperGrants(first.data);assert.equal(next.count,0);assert.equal(next.data.papers[0].fund,'Corrected grant');});
