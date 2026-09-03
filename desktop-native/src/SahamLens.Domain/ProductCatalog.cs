namespace SahamLens.Domain;

public enum AccessLevel { Public, Account, Pro, Admin }
public enum WorkspaceId { Market, Screener, Analysis, Intelligence, Research, Admin, Settings }

public sealed record ProductModule(
    string Id,
    string Label,
    WorkspaceId Workspace,
    string Endpoint,
    AccessLevel Access = AccessLevel.Public,
    string Method = "GET",
    bool RequiresTicker = false,
    TimeSpan? CacheDuration = null);

public static class ProductCatalog
{
    public static readonly IReadOnlyList<ProductModule> Modules =
    [
        new("market-summary", "Ringkasan Pasar", WorkspaceId.Market, "/api/market-summary", CacheDuration: TimeSpan.FromSeconds(30)),
        new("market-pulse", "Market Pulse", WorkspaceId.Market, "/api/market-pulse", CacheDuration: TimeSpan.FromSeconds(30)),
        new("watchlist", "Daftar Pantau", WorkspaceId.Market, "/api/watchlist/desktop", AccessLevel.Account),
        new("screener", "Screener", WorkspaceId.Screener, "/api/screener", AccessLevel.Account),
        new("overview", "Overview", WorkspaceId.Analysis, "/api/stock/{ticker}", RequiresTicker: true),
        new("technical", "Teknikal", WorkspaceId.Analysis, "/api/public-chart/{ticker}.JK?tf=10Y", RequiresTicker: true, CacheDuration: TimeSpan.FromSeconds(30)),
        new("fundamental", "Fundamental", WorkspaceId.Analysis, "/api/fundamental/{ticker}", RequiresTicker: true, CacheDuration: TimeSpan.FromMinutes(1)),
        new("dcf", "DCF", WorkspaceId.Analysis, "/api/dcf/{ticker}", RequiresTicker: true),
        new("earnings", "Earnings", WorkspaceId.Analysis, "/api/earnings/{ticker}", RequiresTicker: true),
        new("ownership", "Ownership", WorkspaceId.Analysis, "/api/ownership-flow/{ticker}", RequiresTicker: true),
        new("backtest", "Backtest", WorkspaceId.Analysis, "/api/backtest", AccessLevel.Account, "POST", true),
        new("compare", "Compare", WorkspaceId.Analysis, "/api/compare", RequiresTicker: true),
        new("news", "News Terbaru", WorkspaceId.Intelligence, "/api/news", CacheDuration: TimeSpan.FromMinutes(1)),
        new("macro", "Makro", WorkspaceId.Intelligence, "/api/macro", CacheDuration: TimeSpan.FromMinutes(5)),
        new("calendar", "Kalender", WorkspaceId.Intelligence, "/api/calendar", CacheDuration: TimeSpan.FromMinutes(5)),
        new("radar", "Breakout Radar", WorkspaceId.Intelligence, "/api/breakout-radar", AccessLevel.Account),
        new("consensus", "Consensus Lens AI", WorkspaceId.Research, "/api/recommendations?symbols={ticker}", AccessLevel.Account, RequiresTicker: true),
        new("bandarmology", "Bandarmology", WorkspaceId.Research, "/api/ownership-flow/{ticker}", AccessLevel.Account, RequiresTicker: true),
        new("checklist", "Checklist", WorkspaceId.Research, "/api/fundamental/{ticker}", RequiresTicker: true),
        new("position-sizing", "Position Sizing", WorkspaceId.Research, "/api/risk-analysis", AccessLevel.Account, "POST", true),
        new("dividend", "Dividend", WorkspaceId.Research, "/api/dividend-plan", AccessLevel.Account, "GET", true),
        new("risk", "Risk", WorkspaceId.Research, "/api/risk-analysis", AccessLevel.Account, "POST", true),
        new("admin-overview", "Status Platform", WorkspaceId.Admin, "/api/admin/desktop-overview", AccessLevel.Admin),
        new("decision-lab", "Decision Lab", WorkspaceId.Admin, "/api/admin/decision-lab", AccessLevel.Admin),
        new("transparency", "Transparansi", WorkspaceId.Admin, "/api/admin/transparency", AccessLevel.Admin),
        new("tpcl", "Validasi TP/CL", WorkspaceId.Admin, "/api/admin/tpcl-validation", AccessLevel.Admin),
        new("ownership-admin", "Ownership Flow", WorkspaceId.Admin, "/api/admin/ownership-flow", AccessLevel.Admin),
        new("jobs", "Jobs", WorkspaceId.Admin, "/api/admin/jobs", AccessLevel.Admin),
        new("stats", "Statistik", WorkspaceId.Admin, "/api/admin/stats", AccessLevel.Admin),
        new("account", "Akun", WorkspaceId.Settings, "/api/auth/me", AccessLevel.Account),
        new("update", "Pembaruan", WorkspaceId.Settings, "/api/desktop/update")
    ];

    public static ProductModule Get(string id) => Modules.Single(x => x.Id == id);
    public static IEnumerable<ProductModule> For(WorkspaceId workspace) => Modules.Where(x => x.Workspace == workspace);
}
