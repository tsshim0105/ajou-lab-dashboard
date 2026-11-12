function runVisualMeeting() {
 const select = document.querySelector('#meeting');
 const form = document.querySelector('form');
 const button = form.querySelector('button');
 const status = document.querySelector('#status');
 const results = document.querySelector('#results');
 const labels = {topic:'연구 주제',condition:'실험 조건',observation:'관찰·결과',hypothesis:'가설',experiment:'후속 실험',action:'후속 조치'};
 const element = (tag,text,classes) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (classes) node.className = classes;
  return node;
 };
 async function request(action, options) {
  const response = await fetch('/api/ai/recording-visual-'+action, {cache:'no-store',...options});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '요청을 완료하지 못했습니다.');
  return data;
 }
 const stamp = seconds => {
  const millis = Math.floor(seconds * 1000);
  return Math.floor(millis/60000)+':'+String(Math.floor(millis/1000)%60).padStart(2,'0')+
   (millis%1000 ? '.'+String(millis%1000).padStart(3,'0').replace(/0+$/,'') : '');
 };
 function section(title) {
  const node = element('section',null,'section');
  node.append(element('h2',title));
  results.append(node);
  return node;
 }
 function render(items) {
  const map = section('연구 지식 맵');
  const topics = items.filter(item => item.kind === 'topic');
  const link = item => {
   const node = element('a',item.quote);
   node.href = '#source-'+item.id;
   return node;
  };
  const list = (parent, entries, ordered = false) => {
   const group = element(ordered?'ol':'ul',null,ordered?'timeline':'branches');
   for (const item of entries) {
    const line = element('li');
    line.append(element('span',ordered ? stamp(item.start) : labels[item.kind],'label'),link(item));
    group.append(line);
   }
   parent.append(group);
  };
  for (const topic of topics) {
   const branch = element('div',null,'topic');
   branch.append(link(topic));
   const related = items.filter(item => item.topic === topic.id);
   if (related.length) list(branch,related);
   map.append(branch);
  }
  const unlinked = items.filter(item => item.kind !== 'topic' && item.topic === null);
  if (unlinked.length) {
   const branch = element('div',null,'topic');
   branch.append(element('h3','주제 연결 근거 없음'));
   list(branch,unlinked);
   map.append(branch);
  }
  if (!items.length) map.append(element('p','전사문에서 분류할 근거를 찾지 못했습니다.','muted'));

  const timeline = section('발언 타임라인');
  const timed = items.filter(item => item.start !== null).sort((a,b) => a.start-b.start || a.segment-b.segment);
  if (timed.length) list(timeline,timed,true);
  else timeline.append(element('p','추출된 발언에 저장된 타임스탬프가 없습니다.','muted'));

  function cards(title,kinds) {
   const group = section(title);
   const grid = element('div',null,'cards');
   for (const item of items.filter(item => kinds.includes(item.kind))) {
    const card = element('article',null,'card');
    card.id = 'source-'+item.id;
    card.tabIndex = -1;
    card.append(element('h3',labels[item.kind]),element('blockquote',item.quote));
    if (item.speaker || item.start !== null) card.append(element('p',
     [item.speaker,item.start === null ? null : stamp(item.start)].filter(Boolean).join(' · '),'muted'));
    grid.append(card);
   }
   if (grid.childElementCount) group.append(grid);
   else group.append(element('p','전사문에서 확인된 항목이 없습니다.','muted'));
  }
  cards('연구 정보 카드',['topic','condition','observation','hypothesis']);
  cards('액션 항목',['experiment','action']);
 }
 select.addEventListener('change', () => {
  results.replaceChildren();
  status.textContent = '';
  button.disabled = !select.value;
 });
 form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!select.value || button.disabled) return;
  select.disabled = button.disabled = true;
  results.replaceChildren();
  status.textContent = '전사문에서 근거를 찾고 있습니다…';
  try {
   const data = await request('analyze',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Request':'1'},body:JSON.stringify({id:select.value})});
   render(data.items);
   status.textContent = '';
  } catch (error) {
   status.textContent = error.message;
  } finally {
   select.disabled = button.disabled = false;
  }
 });
 request('list').then(({meetings}) => {
  for (const meeting of meetings) {
   const date = new Date(meeting.created || NaN);
   const label = Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) : meeting.id;
   const option = element('option',label);
   option.value = meeting.id;
   select.append(option);
  }
  select.disabled = !meetings.length;
  if (meetings.length === 1) {
   select.value = meetings[0].id;
   button.disabled = false;
  }
  status.textContent = meetings.length ? '' : '투명광결정의 종료 회의를 찾지 못했습니다.';
 }).catch(error => {status.textContent = error.message;});
}

export const visualMeetingPage = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Visual Meeting · NISML Hub</title>
<style>
:root{color-scheme:light dark;--page:#f4f6f9;--card:#fff;--ink:#172b45;--muted:#4b617a;--edge:#d3deed;--accent:#1458bf}
@media(prefers-color-scheme:dark){:root{--page:#101a28;--card:#192639;--ink:#ecf4ff;--muted:#b7c8df;--edge:#405572;--accent:#a9caff}}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:16px/1.65 system-ui,sans-serif}
main{max-width:1120px;margin:auto;padding:28px 18px 56px}nav{display:flex;flex-wrap:wrap;gap:16px;border-bottom:1px solid var(--edge);padding-bottom:14px}
a{color:var(--accent)}nav span{font-weight:700}h1{font-size:clamp(1.8rem,4vw,2.65rem);line-height:1.15;margin:32px 0 12px}h2{font-size:1.25rem;margin:0 0 14px}h3{font-size:1rem;margin:0 0 6px}
.muted{color:var(--muted)}form{display:flex;align-items:end;flex-wrap:wrap;gap:12px;margin-top:20px}label{display:grid;gap:5px;font-weight:650}
select,button{font:inherit;min-height:42px;border-radius:6px;padding:6px 12px}select{max-width:100%;background:var(--card);color:var(--ink);border:1px solid var(--edge)}
button{background:#1458bf;color:#fff;border:1px solid transparent;font-weight:700;cursor:pointer}button:disabled{opacity:.6;cursor:default}
.section{margin-top:20px;padding:20px;background:var(--card);border:1px solid var(--edge);border-radius:10px;overflow-wrap:anywhere}
.topic{margin:14px 0;padding:12px 16px;border-left:3px solid var(--accent);background:var(--page);border-radius:4px}.topic>a{font-weight:700}
.branches,.timeline{padding-left:1.4rem}.branches li,.timeline li{padding:5px 0}.label{display:inline-block;font-size:.85rem;font-weight:700;margin-right:.75rem;color:var(--muted);font-variant-numeric:tabular-nums}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:12px}.card{border:1px solid var(--edge);border-radius:8px;padding:14px;background:var(--page)}
.card:target{outline:2px solid var(--accent)}blockquote{margin:0}.card p{margin:8px 0 0;font-size:.875rem}
</style></head><body><main>
<nav aria-label="주 메뉴"><a href="./">NISML Hub</a><span aria-current="page">AI Visual Meeting</span></nav>
<h1>AI Visual Meeting</h1>
<p class="muted">투명광결정의 가장 최근 종료 회의 한 건을 대상으로, 해당 연구 구간의 전사에서 근거를 찾습니다.</p>
<form><label for="meeting">분석할 회의<select id="meeting" required disabled><option value="">회의 선택</option></select></label><button disabled>전사 분석</button></form>
<p id="status" role="status">회의 목록을 불러오는 중…</p><div id="results"></div>
</main><script>(${runVisualMeeting.toString()})();</script></body></html>`;
