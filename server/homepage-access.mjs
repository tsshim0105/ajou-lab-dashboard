export function homepageManagers(state,owner){
 const normalize=s=>String(s||'').trim().toLowerCase();owner=normalize(owner);
 const approved=new Set((state.students||[]).map(normalize));
 const selected=Array.isArray(state.homepageAdmins)?state.homepageAdmins:['soneunji2002@ajou.ac.kr'];
 return [...new Set([owner,...selected.map(normalize).filter(email=>approved.has(email))])].filter(Boolean);
}
export function updateHomepageManagers(state,input,owner){
 if(!Array.isArray(input)||input.length>100||input.some(s=>typeof s!=='string'||!/^\S+@\S+\.\S+$/.test(s)||s.length>254))throw Error('관리자 이메일을 확인해주세요.');
 const values=[...new Set(input.map(s=>s.trim().toLowerCase()))],allowed=new Set([owner.toLowerCase(),...state.students]);
 if(values.some(email=>!allowed.has(email)))throw Error('대시보드 접근 계정에 먼저 추가해주세요.');
 return [...new Set([owner.toLowerCase(),...values])];
}
