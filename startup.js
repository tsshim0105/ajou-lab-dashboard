// One reveal per document; background refreshes do not replay it.
(()=>{
 const splash=document.getElementById('startupSplash'),app=document.querySelector('main.app');
 if(!splash)return;
 const started=performance.now(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 // Reveal ends at 1.05 seconds; keep the completed brand visible for 2 more seconds.
 const minimumDisplayMs=reduced?2000:3050;
 let closing=false;app.inert=true;
 function finish(){
  if(closing)return;closing=true;clearTimeout(failsafe);
  setTimeout(()=>{app.inert=false;splash.classList.add('startup-leaving');setTimeout(()=>splash.remove(),reduced?0:360);},Math.max(0,minimumDisplayMs-(performance.now()-started)));
 }
 // Never trap the interface after an unexpected connection or script failure.
 const failsafe=setTimeout(finish,15000);
 globalThis.DashboardStartup={finish};
})();
