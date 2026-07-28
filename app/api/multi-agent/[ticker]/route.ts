export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { ticker: string } }) {
  const { ticker } = params;
  try {
    const payload = await req.json();
    const res = await fetch('http://127.0.0.1:8000/api/analyze/multi-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, ...payload })
    });
    
    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}`);
    }
    
    const data = await res.json();
    return Response.json(data);
  } catch(e: any) { 
    console.error(e);
    return Response.json({ error: 'fetch failed', details: e.message }, { status: 500 }) 
  }
}
