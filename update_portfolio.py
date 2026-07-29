import re

with open('app/portfolio/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

replacements = {
    'bg-gray-50': 'bg-[#0f172a]',
    'bg-white': 'bg-[#131c2e]',
    'text-gray-800': 'text-white',
    'text-gray-900': 'text-white',
    'text-gray-500': 'text-gray-400',
    'text-gray-400': 'text-gray-500',
    'text-gray-700': 'text-gray-300',
    'border-gray-200': 'border-[#1e293b]',
    'border-gray-100': 'border-[#1e293b]',
    'border-gray-300': 'border-[#334155]',
    'bg-gray-100': 'bg-[#1e293b]',
}

for old, new in replacements.items():
    code = code.replace(old, new)

modal_logic = """
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');
  const [orderSymbol, setOrderSymbol] = useState('');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderLots, setOrderLots] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderLoading(true);
    try {
      const endpoint = orderType === 'BUY' ? '/api/portfolio/buy' : '/api/portfolio/sell';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: orderSymbol.toUpperCase(),
          price: Number(orderPrice),
          lots: Number(orderLots),
          note: 'Manual ' + orderType
        })
      });
      if (res.ok) {
        setShowOrderModal(false);
        setOrderSymbol('');
        setOrderPrice('');
        setOrderLots('');
        loadData();
      } else {
        const err = await res.json();
        alert('Gagal: ' + err.error);
      }
    } catch(err) {
      alert('Error submitting order');
    }
    setOrderLoading(false);
  };
"""

code = code.replace(
    "const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);",
    "const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);\n" + modal_logic
)

buttons_html = """
              <button onClick={() => { setOrderType('BUY'); setShowOrderModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-bold mr-2">BUY</button>
              <button onClick={() => { setOrderType('SELL'); setShowOrderModal(true); }} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-bold">SELL</button>
"""
code = code.replace('<div className="flex items-center gap-4">', '<div className="flex items-center gap-4">\n' + buttons_html)

modal_html = """
      {/* Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl w-full max-w-sm p-6">
            <h2 className={`text-xl font-bold mb-4 ${orderType === 'BUY' ? 'text-blue-400' : 'text-red-400'}`}>{orderType} Stock</h2>
            <form onSubmit={submitOrder} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Symbol (e.g. BBCA.JK)</label>
                <input required type="text" value={orderSymbol} onChange={e=>setOrderSymbol(e.target.value)} className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded p-2" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Price (Rp)</label>
                <input required type="number" value={orderPrice} onChange={e=>setOrderPrice(e.target.value)} className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded p-2" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Lots</label>
                <input required type="number" value={orderLots} onChange={e=>setOrderLots(e.target.value)} className="w-full bg-[#0f172a] border border-[#1e293b] text-white rounded p-2" />
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setShowOrderModal(false)} className="flex-1 py-2 rounded bg-[#1e293b] text-white">Cancel</button>
                <button type="submit" disabled={orderLoading} className={`flex-1 py-2 rounded text-white font-bold ${orderType === 'BUY' ? 'bg-blue-600' : 'bg-red-600'}`}>
                  {orderLoading ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
"""
code = code.replace('</main>', '</main>\n' + modal_html)

with open('app/portfolio/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Portfolio updated!")
