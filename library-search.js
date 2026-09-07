const { URL } = require('url');

exports.handler = async (event) => {
  const params = new URLSearchParams(event.rawQuery || '');
  const type = params.get('type') || 'movies';
  const q = (params.get('q') || '').trim();
  const imageUrl = (params.get('url') || '').trim();

  try {
    if (type === 'metadata') {
      if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return response(400,{error:'invalid url'});
      const page=await fetch(imageUrl,{headers:{'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/605.1.15','accept':'text/html,application/xhtml+xml'}});
      if(!page.ok) return response(page.status,{error:`page ${page.status}`});
      const html=await page.text();
      const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'\"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
      const meta=(name)=>{const r=new RegExp(`<meta[^>]+(?:property|name)=[\"']${name}[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>`,`i`).exec(html)||new RegExp(`<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name)=[\"']${name}[\"'][^>]*>`,`i`).exec(html);return decode(r?.[1]||'')};
      const ld=[];for(const m of html.matchAll(/<script[^>]+type=[\"']application\/ld\+json[\"'][^>]*>([\s\S]*?)<\/script>/gi)){try{const j=JSON.parse(m[1].trim());ld.push(...(Array.isArray(j)?j:[j]))}catch{}}
      const graph=ld.flatMap(x=>Array.isArray(x?.['@graph'])?x['@graph']:[x]);
      const obj=graph.find(x=>x&&typeof x==='object'&&(['Book','Movie','TVSeries','TVEpisode'].includes(x['@type'])||x.author||x.director||x.image))||{};
      const title=decode(obj.name||meta('og:title')||meta('twitter:title')||((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)||[])[1]||'').replace(/<[^>]+>/g,''));
      let image=decode((Array.isArray(obj.image)?obj.image[0]:obj.image)||meta('og:image')||meta('twitter:image'));
      const people=v=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:x?.name).filter(Boolean).join(', '):typeof v==='string'?v:(v?.name||'');
      let creator=people(obj.author)||people(obj.director)||people(obj.creator);
      const cleanTitle=title.replace(/\s*[|｜].*$/,'').trim();
      if(!creator && cleanTitle){
        if(kind==='books'){
          const r=await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent('intitle:'+cleanTitle)}&maxResults=10&printType=books&orderBy=relevance`);if(r.ok){const j=await r.json();const best=(j.items||[])[0]?.volumeInfo||{};creator=(best.authors||[]).join(', ');if(!image){const im=best.imageLinks||{};image=im.extraLarge||im.large||im.medium||im.thumbnail||im.smallThumbnail||''}}
        }else{
          const r=await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&entity=movie&country=KR&limit=10`);if(r.ok){const j=await r.json();const best=(j.results||[])[0]||{};creator=best.artistName||'';if(!image)image=best.artworkUrl100||''}
          if(!creator){const t=await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(cleanTitle)}`);if(t.ok){const j=await t.json();creator=j?.[0]?.show?.network?.name||'';if(!image)image=j?.[0]?.show?.image?.original||j?.[0]?.show?.image?.medium||''}}
        }
      }
      return response(200,{title:cleanTitle,creator,image:safeHttp(image),source:'link'});
    }
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

function safeHttp(v){return /^https?:\/\//i.test(String(v||''))?String(v):''}
