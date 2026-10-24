// One reveal per document; background refreshes do not replay it.
(()=>{
 const splash=document.getElementById('startupSplash'),app=document.querySelector('main.app');
 if(!splash)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const brand=splash.querySelector('.startup-brand'),logo=splash.querySelector('.startup-brand>img');
 let play,closing=false,requested=false;app.inert=true;
 function dismiss(){if(closing)return;closing=true;clearTimeout(failsafe);app.inert=false;splash.classList.add('startup-leaving');setTimeout(()=>splash.remove(),reduced?0:360);}
 const loaded=document.readyState==='complete'?Promise.resolve():new Promise(resolve=>addEventListener('load',resolve,{once:true}));
 const assets=Promise.allSettled([loaded,document.fonts?.ready||Promise.resolve(),logo.decode?logo.decode():Promise.resolve()]);
 // Play the approved globe reveal, then hold the shared header lockup.
 const minimumDisplayMs=reduced?2000:4650;
 // Vector canvas stays sharp at any pixel density; no looping GIF download.
 if(!reduced){
  const canvas=document.createElement('canvas');canvas.className='startup-globe';canvas.setAttribute('aria-hidden','true');splash.prepend(canvas);
  const ctx=canvas.getContext('2d');
  if(ctx){
   splash.classList.add('has-globe');
   const ease=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
   const mix=(a,b,t)=>a+(b-a)*t;
   let last=null,elapsed=0;
   function render(now){
    if(!canvas.isConnected||closing)return;
    if(document.hidden){last=null;requestAnimationFrame(render);return;}
    if(last!==null)elapsed+=Math.min(100,Math.max(0,now-last));last=now;
    const t=elapsed/1000,close=ease((t-1.65)/1.2),intro=ease(t/.45);
    const reveal=ease((t-2.45)/.55);brand.style.opacity=String(reveal);brand.style.transform=`translateY(${5*(1-reveal)}px)`;
    const width=Math.min(800,innerWidth),height=width*440/800,dpr=Math.min(devicePixelRatio||1,3);
    if(canvas.width!==Math.round(width*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    ctx.setTransform(canvas.width/800,0,0,canvas.height/440,0,0);ctx.clearRect(0,0,800,440);
    const dark=document.documentElement.dataset.theme==='dark';
    ctx.save();ctx.globalAlpha=ease((t-.2)/.65)*(1-close);ctx.strokeStyle=dark?'#6696a5':'#9bc1ca';ctx.lineWidth=.8;
    ctx.beginPath();ctx.arc(400,215,145,0,Math.PI*2);ctx.stroke();
    const path=points=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
    for(const lat of [-.66,-.33,0,.33,.66]){const w=145*Math.sqrt(1-lat*lat);path(Array.from({length:181},(_,k)=>[400+w*Math.cos(k*Math.PI/90),215+145*lat+12*Math.sin(k*Math.PI/90)]));}
    for(let j=0;j<7;j++){const a=j*Math.PI/7+t*.18;path(Array.from({length:181},(_,k)=>[400+145*Math.sin(k*Math.PI/180)*Math.cos(a),215+145*Math.cos(k*Math.PI/180)]));}
    ctx.fillStyle='#72aab4';for(let j=0;j<12;j++){const lat=Math.sin(j*1.7)*.8,a=j*2.399+t*.18;ctx.beginPath();ctx.arc(400+145*Math.sqrt(1-lat*lat)*Math.cos(a),215+145*lat,2,0,Math.PI*2);ctx.fill();}ctx.restore();
    const labels=['Dashboard','Repository','AI Meeting'],pts=[[400,106],[225,304],[575,304]];
    labels.forEach((label,i)=>{
     const a=ease((t-.22-i*.13)/.52),travel=a*(1-close),x=mix(400,pts[i][0],travel),y=mix(220,pts[i][1],travel);
     ctx.save();ctx.globalAlpha=a*(1-close);ctx.font='bold 23px Arial';const left=x-(ctx.measureText(label).width+43)/2;
     ctx.fillStyle=dark?'#e6f1f6':'#172b3b';ctx.textBaseline='middle';ctx.fillText(label,left+44,y);
     ctx.translate(left,y-18);ctx.scale(1/3,1/3);ctx.strokeStyle=dark?'#a7cbd4':'#264b5b';ctx.lineWidth=5;ctx.lineJoin='round';ctx.lineCap='round';
     const rect=(x,y,w,h,r)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.stroke();};
     if(i===0){[[9,12,36,33],[60,12,36,21],[9,60,36,33],[60,48,36,45]].forEach(v=>rect(...v,5));ctx.fillStyle='#5c948b';ctx.fillRect(65,53,26,35);}
     else if(i===1){rect(10,31,87,61,6);path([[10,39],[10,20],[40,20],[51,31]]);path([[33,46],[33,76]]);path([[52,44],[52,76]]);path([[69,45],[79,75]]);}
     else{rect(8,16,79,62,12);path([[27,78],[21,95],[47,78]]);path([[29,47],[44,47]]);path([[52,47],[65,47]]);ctx.fillStyle='#5c948b';ctx.beginPath();[[88,1],[92,13],[104,17],[92,21],[88,33],[84,21],[72,17],[84,13]].forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.fill();}
     ctx.restore();
    });
    if(logo.complete&&logo.naturalWidth){ctx.globalAlpha=intro*(1-ease((t-2.45)/.4));ctx.drawImage(logo,354,174,92,92);ctx.globalAlpha=1;}
    if(elapsed<minimumDisplayMs)requestAnimationFrame(render);else{canvas.remove();dismiss();}
   }
   play=()=>requestAnimationFrame(render);
  }
 }
 // The dashboard calls finish only after its initial data has rendered.
 async function finish(){
  if(requested||closing)return;requested=true;
  await assets;
  if(document.hidden)await new Promise(resolve=>{const visible=()=>{if(!document.hidden){document.removeEventListener('visibilitychange',visible);resolve();}};document.addEventListener('visibilitychange',visible);});
  if(closing)return;
  clearTimeout(failsafe);
  requestAnimationFrame(()=>{
   if(closing)return;splash.classList.add('startup-playing');
   if(play)play();else{brand.style.opacity='1';setTimeout(dismiss,200);}
  });
 }
 // A failed network/script must never leave the app trapped behind the splash.
 const failsafe=setTimeout(dismiss,20000);
 globalThis.DashboardStartup={finish};
})();
