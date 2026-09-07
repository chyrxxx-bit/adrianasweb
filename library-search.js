export default async (request) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'movies';
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return json({error:'missing query'}, 400);

  const terms = [...new Set([
    q,
    q.replace(/\s+/g, ''),
    q.split(/\s+/).filter(Boolean).join(' ')
  ].filter(Boolean))];

  try {
    if (type === 'books') {
      const results = [];
      for (const term of terms) {
        const api = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent('intitle:'+term)}&maxResults=40&printType=books&orderBy=relevance`;
        const r = await fetch(api, {headers:{accept:'application/json'}});
        if (r.ok) {
          const j = await r.json();
          results.push(...(j.items || []));
        }
      }
      return json({source:'google-books', items:results});
    }

    const imdb = [];
    const appleKR = [];
    const appleUS = [];
    const tvmaze = [];
    for (const term of terms) {
      const enc = encodeURIComponent(term.toLowerCase());
      const urls = [
        `https://v3.sg.media-imdb.com/suggestion/x/${enc}.json`,
        `https://v3.sg.media-imdb.com/suggestion/titles/x/${enc}.json`,
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=movie&country=KR&limit=50&media=movie`,
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=movie&country=US&limit=50&media=movie`,
        `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(term)}`
      ];
      const rs = await Promise.allSettled(urls.map(u => fetch(u, {headers:{accept:'application/json'}})));
      for (let i=0;i<rs.length;i++) {
        if (rs[i].status !== 'fulfilled' || !rs[i].value.ok) continue;
        try {
          const j = await rs[i].value.json();
          if (i < 2) imdb.push(...(j.d || []));
          else if (i === 2) appleKR.push(...(j.results || []));
          else if (i === 3) appleUS.push(...(j.results || []));
          else tvmaze.push(...(Array.isArray(j) ? j : []));
        } catch {}
      }
    }
    return json({source:'screen-search', imdb, appleKR, appleUS, tvmaze});
  } catch (e) {
    return json({error:'search failed', detail:String(e?.message||e)}, 502);
  }
};
function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}})
}
