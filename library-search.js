export default async (request) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'movies';
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return json({error:'missing query'}, 400);

  try {
    if (type === 'books') {
      const api = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=40&printType=books&orderBy=relevance`;
      const r = await fetch(api, {headers:{'accept':'application/json'}});
      if (!r.ok) throw new Error(`books ${r.status}`);
      const j = await r.json();
      return json({source:'google-books', items:j.items||[]});
    }

    const imdbUrl = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q.toLowerCase())}.json`;
    const appleKR = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=movie&country=KR&limit=50&media=movie`;
    const appleUS = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=movie&country=US&limit=50&media=movie`;
    const [imdb, kr, us] = await Promise.allSettled([
      fetch(imdbUrl).then(r=>r.ok?r.json():{d:[]}),
      fetch(appleKR).then(r=>r.ok?r.json():{results:[]}),
      fetch(appleUS).then(r=>r.ok?r.json():{results:[]})
    ]);
    return json({
      source:'screen-search',
      imdb: imdb.status==='fulfilled' ? (imdb.value.d||[]) : [],
      appleKR: kr.status==='fulfilled' ? (kr.value.results||[]) : [],
      appleUS: us.status==='fulfilled' ? (us.value.results||[]) : []
    });
  } catch (e) {
    return json({error:'search failed'}, 502);
  }
};
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
