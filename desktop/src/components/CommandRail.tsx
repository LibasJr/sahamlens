import React from 'react';
import {
  LayoutDashboard,
  Activity,
  Radar,
  LineChart,
  Building2,
  Users,
  Filter,
  CircleDollarSign,
  History,
  ShieldAlert,
  Newspaper,
  CalendarDays,
  Settings,
  Star,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export type ActiveModule =
  | 'overview'
  | 'market-pulse'
  | 'radar'
  | 'watchlist'
  | 'technical'
  | 'fundamental'
  | 'ownership'
  | 'screener'
  | 'valuation'
  | 'backtest'
  | 'news'
  | 'settings';

interface CommandRailProps {
  activeModule: ActiveModule;
  onSelectModule: (module: ActiveModule) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  selectedTicker: string;
}

export const CommandRail: React.FC<CommandRailProps> = ({
  activeModule,
  onSelectModule,
  collapsed,
  onToggleCollapse,
  selectedTicker,
}) => {
  const groups = [
    {
      id: 'market',
      title: 'Pasar',
      items: [
        { id: 'overview', label: 'Terminal Pasar', icon: LayoutDashboard },
        { id: 'market-pulse', label: 'LensMarket', icon: Activity, badge: 'Live' },
        { id: 'radar', label: 'Breakout Radar', icon: Radar, badge: 'Hot' },
        { id: 'watchlist', label: 'Daftar Pantau', icon: Star },
      ],
    },
    {
      id: 'research',
      title: 'Riset Emiten',
      items: [
        { id: 'technical', label: `Teknikal (${selectedTicker})`, icon: LineChart },
        { id: 'fundamental', label: `Fundamental (${selectedTicker})`, icon: Building2 },
        { id: 'ownership', label: 'Ownership Flow', icon: Users },
      ],
    },
    {
      id: 'quant',
      title: 'Quant & Tools',
      items: [
        { id: 'screener', label: 'LensScanner Pro', icon: Filter },
        { id: 'valuation', label: 'DCF Valuation', icon: CircleDollarSign },
        { id: 'backtest', label: 'Backtest Strategi', icon: History },
      ],
    },
    {
      id: 'info',
      title: 'Konteks',
      items: [
        { id: 'news', label: 'News & Sentimen', icon: Newspaper },
        { id: 'settings', label: 'Pengaturan', icon: Settings },
      ],
    },
  ];

  return (
    <aside
      className={`h-[calc(100vh-2.5rem)] bg-pro-bg border-r border-pro-border flex flex-col justify-between transition-all duration-200 select-none ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        {groups.map((grp) => (
          <div key={grp.id} className="px-2">
            {!collapsed && (
              <div className="px-2.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-pro-textSubtle">
                {grp.title}
              </div>
            )}
            <div className="space-y-0.5">
              {grp.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectModule(item.id as ActiveModule)}
                    title={collapsed ? item.label : undefined}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                      isActive
                        ? 'bg-pro-card text-pro-accent border border-pro-borderStrong font-semibold shadow-xs'
                        : 'text-pro-textMuted hover:text-pro-text hover:bg-pro-surface'
                    }`}
                  >
                    <Icon size={16} className={isActive ? 'text-pro-accent' : 'text-pro-textSubtle'} />
                    {!collapsed && (
                      <div className="flex-1 flex items-center justify-between truncate">
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                              item.badge === 'Live'
                                ? 'bg-pro-profitBg text-pro-profit border border-pro-profit/30'
                                : 'bg-pro-accentMuted text-pro-accent border border-pro-accent/30'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer / Toggle Rail */}
      <div className="p-2 border-t border-pro-border flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2 px-2 text-[11px] text-pro-textSubtle">
            <span className="w-1.5 h-1.5 rounded-full bg-pro-profit animate-pulse" />
            <span>Terminal Connected</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-md hover:bg-pro-card text-pro-textMuted hover:text-pro-text transition mx-auto"
          title={collapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
};
