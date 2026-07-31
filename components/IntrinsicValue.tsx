'use client';

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Target, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';

interface IntrinsicValueProps {
  symbol: string;
}

export default function IntrinsicValue({ symbol }: IntrinsicValueProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/intrinsic/${symbol}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        console.error("Error fetching intrinsic data:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) {
    return (
      <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 flex justify-center items-center h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tv-accent"></div>
      </div>
    );
  }

  if (!data || data.error) {
    return null;
  }

  const { fair_value, harga, mos, methods, sektor } = data;
  
  // Format data for chart
  const chartData = Object.keys(methods).map(key => ({
    name: methods[key].name,
    value: methods[key].value,
    fill: methods[key].color
  }));

  const formatIDR = (val: number) => {
    if (!val) return '0';
    return Math.round(val).toLocaleString('id-ID');
  };

  let mosStatus = 'FAIR';
  let mosColor = 'tv-yellow';
  let mosBg = 'bg-[#f59e0b]';
  let mosBorder = 'border-[#f59e0b]';
  let mosText = 'text-[#f59e0b]';
  let mosLabel = 'Harga Wajar (Fair)';
  let Icon = Target;

  if (mos >= 15) {
    mosStatus = 'UNDERVALUED';
    mosColor = 'tv-green';
    mosBg = 'bg-tv-green';
    mosBorder = 'border-tv-green';
    mosText = 'text-tv-green';
    mosLabel = 'Saham Undervalued / Diskon';
    Icon = TrendingUp;
  } else if (mos <= -15) {
    mosStatus = 'OVERVALUED';
    mosColor = 'tv-red';
    mosBg = 'bg-tv-red';
    mosBorder = 'border-tv-red';
    mosText = 'text-tv-red';
    mosLabel = 'Saham Overvalued / Premium';
    Icon = TrendingDown;
  }
  
  return (
    <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1">
      <div className="flex justify-between items-center border-b border-tv-border pb-3 mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-tv-accent" />
            Intrinsic Value Engine
          </h3>
        </div>
        <div className="text-xs font-mono text-tv-muted px-2 py-1 rounded bg-tv-bg border border-tv-border">
          Sector: {sektor || 'Unknown'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Value Summary */}
        <div className="col-span-1 flex flex-col justify-center space-y-4">
          <div className="bg-tv-bg border border-tv-border rounded-lg p-4 text-center relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-full h-1 ${mosBg}`}></div>
            <div className="text-xs text-tv-muted font-mono uppercase mb-2">Estimasi Harga Wajar (Median)</div>
            <div className="text-3xl font-bold text-white mb-1">
              Rp {formatIDR(fair_value)}
            </div>
            <div className="text-sm font-mono text-tv-muted flex items-center justify-center gap-2">
              Harga saat ini: Rp {formatIDR(harga)}
            </div>
          </div>

          <div className={`border rounded-lg p-4 text-center bg-opacity-10 ${mosBorder}/30 ${mosText}`} style={{ backgroundColor: mosStatus === 'FAIR' ? 'rgba(245, 158, 11, 0.1)' : undefined }}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <Icon className="w-5 h-5" />
              <span className="font-bold">Margin of Safety (MOS)</span>
            </div>
            <div className="text-2xl font-extrabold">
              {mos > 0 ? '+' : ''}{mos.toFixed(2)}%
            </div>
            <div className="text-xs mt-1 opacity-80">
              {mosStatus} - {mosLabel}
            </div>
          </div>
        </div>

        {/* Chart and Methods Breakdown */}
        <div className="col-span-1 lg:col-span-2 flex flex-col">
          <div className="h-[200px] w-full mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#6B7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => Number(v).toLocaleString('id-ID')} />
                <Tooltip 
                  cursor={{ fill: '#1F2937', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: '#131722', borderColor: '#2A2E39', color: '#fff', fontSize: '12px' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: any) => [`Rp ${Number(value).toLocaleString('id-ID')}`, 'Value']}
                />
                <ReferenceLine y={harga} stroke="#EF4444" strokeDasharray="3 3" label={{ position: 'top', value: 'Harga Sekarang', fill: '#EF4444', fontSize: 10 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-4 pt-4 border-t border-tv-border">
            {Object.keys(methods).map(key => (
              <div key={key} className="bg-tv-bg border border-tv-border rounded p-2 text-center">
                <div className="text-[10px] text-tv-muted uppercase truncate" title={methods[key].name}>{methods[key].name}</div>
                <div className="text-sm font-bold text-white mt-1" style={{ color: methods[key].color }}>
                  {formatIDR(methods[key].value)}
                </div>
              </div>
            ))}
          </div>
          
          {/* Active Methods (Sector Router) */}
          {data.applied_rule && Object.keys(data.applied_rule).length > 0 && (
            <div className="mt-4 pt-3 border-t border-tv-border">
              <div className="text-[10px] text-tv-muted uppercase mb-2">Metode Kalkulasi Aktif (Weighted Sector Router)</div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(data.applied_rule).map(key => (
                  <div key={key} className="px-2 py-1 rounded bg-tv-card border border-tv-border text-[10px] font-mono text-white">
                    {key.toUpperCase()} <span className="text-tv-accent ml-1">{(data.applied_rule[key] * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
