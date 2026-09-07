const { URL } = require('url');

exports.handler = async (event) => {
  const params = new URLSearchParams(event.rawQuery || '');
  const type = params.get('type') || 'movies';
  const q = (params.get('q') || '').trim();
  const imageUrl = (params.get('url') || '').trim();

  try {
    if (type === 'image') {
      if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return response(400, {error:'invalid image url'});
      const r = await fetch(imageUrl, {headers:{'user-agent':'Mozilla/5.0'}});
      if (!r.ok) return response(r.status, {error:`image ${r.status}`});
      const ct = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
      if (!ct.startsWith('image/')) return response(415, {error:'not an image'});
      const buf = Buffer.from(await r.arrayBuffer());
      return {statusCode:200,isBase64Encoded:true,headers:{'content-type':ct,'cache-control':'public,max-age=86400'},body:buf.toString('base64')};
    }
    if (!q) return response(400, {error:'missing query'});
    const terms = [...new Set([q, q.replace(/\s+/g,''), q.split(/\s+/).filter(Boolean).join(' ')].filter(Boolean))];

    if (type === 'books') {
      const items=[];
      for (const term of terms) {
        const urls=[
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent('intitle:'+term)}&maxResults=40&printType=books&orderBy=relevance`,
          `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(term)}&maxResults=40&printType=books&orderBy=relevance`
        ];
        const rs=await Promise.allSettled(urls.map(u=>fetch(u,{headers:{accept:'application/json'}})));
        for(const r of rs){if(r.status!=='fulfilled'||!r.value.ok)continue;try{const j=await r.value.json();items.push(...(j.items||[]))}catch{}}
      }
      return response(200,{source:'google-books',items});
    }

    const appleKR=[],appleUS=[],tvmaze=[];
    for(const term of terms){
      const urls=[
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=movie&country=KR&limit=50&media=movie`,
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=movie&country=US&limit=50&media=movie`,
        `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(term)}`
      ];
      const rs=await Promise.allSettled(urls.map(u=>fetch(u,{headers:{accept:'application/json'}})));
      for(let i=0;i<rs.length;i++){
        const r=rs[i];if(r.status!=='fulfilled'||!r.value.ok)continue;
        try{const j=await r.value.json();if(i===0)appleKR.push(...(j.results||[]));else if(i===1)appleUS.push(...(j.results||[]));else tvmaze.push(...(Array.isArray(j)?j:[]))}catch{}
      }
    }
    return response(200,{source:'screen-search',appleKR,appleUS,tvmaze});
  } catch(e) { return response(502,{error:'search failed',detail:String(e?.message||e)}); }
};
function response(statusCode,body){return {statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'},body:JSON.stringify(body)}}
