import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('native plot bridge accepts only main dashboard and server-authorized professor',()=>{const s=read('desktop/mac/Sources/QtiPlotBridge.swift');for(const pattern of ['web === owner?.web','message.frameInfo.isMainFrame','Lab.isDashboard(url)','user["role"] as? String == "admin"','try await authorize(web)'])assert.ok(s.includes(pattern));});
test('fixed bundled script receives JSON separately, and process does not use a shell',()=>{const s=read('desktop/mac/Sources/QtiPlotBridge.swift');assert.match(s,/process.arguments = \["-x",script.path,input.path\]/);assert.match(s,/forResource:"qtiplot_bridge"/);assert.doesNotMatch(s,/\/bin\/(?:sh|bash|zsh)/);assert.match(s,/bytes.count <= 4_000_000/);assert.match(s,/for _ in 0..<120/);});
test('native and integration sources and scripts stay identical',()=>{for(const f of ['Sources/QtiPlotBridge.swift','Resources/qtiplot_bridge.py','build.sh'])assert.equal(read('desktop/mac/'+f),read('integrations/macos/'+f));});
test('browser shows explicit app requirement and sends parsed data/settings',()=>{const s=read('data-plot.js');assert.match(s,/nismlQtiPlot/);assert.match(s,/Mac용 Hub 0\.4\.21/);assert.match(s,/payload:\{\.\.\.input,settings\}/);assert.match(s,/if\(qtiBusy\)return/);});
