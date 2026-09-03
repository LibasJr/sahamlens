using System.Net;
using System.Text;
using SahamLens.Application;
using SahamLens.Domain;
using SahamLens.Infrastructure;

namespace SahamLens.Tests;

public sealed class ArchitectureTests
{
    [Fact]
    public void Catalog_covers_every_native_workspace_and_has_unique_ids()
    {
        Assert.Equal(Enum.GetValues<WorkspaceId>().Order(), ProductCatalog.Modules.Select(x => x.Workspace).Distinct().Order());
        Assert.Equal(ProductCatalog.Modules.Count, ProductCatalog.Modules.Select(x => x.Id).Distinct().Count());
        Assert.True(ProductCatalog.Modules.Count >= 31);
    }

    [Fact]
    public void Every_admin_module_is_server_guarded()
    {
        Assert.All(ProductCatalog.For(WorkspaceId.Admin), module => Assert.Equal(AccessLevel.Admin, module.Access));
        var admin = new Session("admin@sahamlens.id", "admin", false, "jwt");
        Assert.All(ProductCatalog.For(WorkspaceId.Admin), module => AccessPolicy.Demand(admin, module));
    }

    [Fact]
    public void Guest_cannot_silently_run_authenticated_screener()
    {
        var guest = new Session(null, "guest", false, null);
        Assert.Throws<AccessDeniedException>(() => AccessPolicy.Demand(guest, ProductCatalog.Get("screener")));
    }

    [Fact]
    public void Research_loaders_are_explicit_and_ticker_scoped()
    {
        var required = new[] { "overview", "technical", "fundamental", "dcf", "earnings", "ownership", "backtest", "compare", "consensus", "bandarmology" };
        Assert.All(required, id => Assert.True(ProductCatalog.Get(id).RequiresTicker, id));
    }

    [Fact]
    public async Task Authenticated_request_sends_bearer_token()
    {
        HttpRequestMessage? captured = null;
        var handler = new StubHandler(request => { captured = request; return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"analysis\":{\"total_count\":847}}", Encoding.UTF8, "application/json") }; });
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://sahamlens.id") };
        var store = new MemorySessionStore();
        await store.SaveAsync(new Session("admin@sahamlens.id", "admin", true, "native-jwt"));
        var api = new SahamLensApiClient(http, store);
        using var result = await api.SendAsync(ProductCatalog.Get("screener"));
        Assert.Equal("Bearer", captured!.Headers.Authorization!.Scheme);
        Assert.Equal("native-jwt", captured.Headers.Authorization.Parameter);
        Assert.Equal(847, result.RootElement.GetProperty("analysis").GetProperty("total_count").GetInt32());
    }

    [Fact]
    public void Wpf_app_declares_base_class_unambiguously()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
        var source = File.ReadAllText(Path.Combine(root, "src/SahamLens.Wpf/App.xaml.cs"));
        Assert.Contains("System.Windows.Application", source);
        Assert.DoesNotContain("using System.Windows.Forms", source);
    }

    [Fact]
    public void Native_chart_exposes_full_indicator_catalog_and_contains_no_webview()
    {
        Assert.Equal(13, TechnicalIndicators.All.Count);
        Assert.Contains(TechnicalIndicators.All, x => x.Id == "bollinger");
        Assert.Contains(TechnicalIndicators.All, x => x.Id == "macd");
        Assert.Contains(TechnicalIndicators.All, x => x.Id == "williams");
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
        var native = Directory.GetFiles(Path.Combine(root, "src/SahamLens.Wpf"), "*.*", SearchOption.AllDirectories)
            .Where(path => path.EndsWith(".cs") || path.EndsWith(".xaml"))
            .Select(File.ReadAllText);
        var source = string.Join('\n', native);
        Assert.DoesNotContain("WebView2", source, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Tauri", source, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("React", source, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ohlcLabel", source);
        Assert.Contains("replayProgress", source);
    }

    [Fact]
    public async Task Typed_client_unwraps_standard_data_envelope()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"data\":{\"ticker\":\"BBCA.JK\",\"history\":[{\"time\":\"2026-09-01\",\"open\":8000,\"high\":8200,\"low\":7900,\"close\":8150,\"volume\":1000}]}}", Encoding.UTF8, "application/json") });
        var api = new SahamLensApiClient(new HttpClient(handler) { BaseAddress = new Uri("https://sahamlens.id") }, new MemorySessionStore());
        var chart = await api.SendAsync<ChartResult>(ProductCatalog.Get("technical"), "BBCA");
        Assert.Equal("BBCA.JK", chart.Ticker);
        Assert.Single(chart.History);
        Assert.Equal(8150, chart.History[0].Close);
    }

    [Fact]
    public void Key_modules_have_dedicated_native_renderers()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
        Assert.True(File.Exists(Path.Combine(root, "src/SahamLens.Wpf/Views/ScreenerView.cs")));
        Assert.True(File.Exists(Path.Combine(root, "src/SahamLens.Wpf/Views/NewsView.cs")));
        Assert.True(File.Exists(Path.Combine(root, "src/SahamLens.Wpf/Controls/NativeChartControl.cs")));
    }

    [Fact]
    public void Analysis_and_research_modules_use_native_structured_renderer()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
        var rendererPath = Path.Combine(root, "src/SahamLens.Wpf/Views/StructuredModuleView.cs");
        var main = File.ReadAllText(Path.Combine(root, "src/SahamLens.Wpf/MainWindow.cs"));
        var renderer = File.ReadAllText(rendererPath);
        Assert.True(File.Exists(rendererPath));
        Assert.Contains("WorkspaceId.Analysis or WorkspaceId.Research", main);
        Assert.Contains("new StructuredModuleView", main);
        Assert.Contains("Lens AI menampilkan nilai dan evidence aktual", renderer);
        Assert.Contains("SendPathAsync", renderer);
        Assert.DoesNotContain("WebView", renderer, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("GET", ProductCatalog.Get("dividend").Method);
        Assert.Equal(14, ProductCatalog.Modules.Count(x => x.Workspace is WorkspaceId.Analysis or WorkspaceId.Research));
    }

    [Fact]
    public async Task Explicit_path_client_preserves_bearer_for_native_calculators()
    {
        HttpRequestMessage? captured = null;
        var handler = new StubHandler(request => { captured = request; return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"quant\":{}}", Encoding.UTF8, "application/json") }; });
        var store = new MemorySessionStore();
        await store.SaveAsync(new Session("user@sahamlens.id", "user", false, "calculator-token"));
        var api = new SahamLensApiClient(new HttpClient(handler) { BaseAddress = new Uri("https://sahamlens.id") }, store);
        using var _ = await api.SendPathAsync("/api/dividend-plan?mode=ticker&ticker=BBCA", access: AccessLevel.Account);
        Assert.Equal("Bearer", captured!.Headers.Authorization!.Scheme);
        Assert.Equal("calculator-token", captured.Headers.Authorization.Parameter);
        Assert.Contains("mode=ticker", captured.RequestUri!.Query);
    }

    [Fact]
    public void Market_intelligence_and_settings_have_native_renderers()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
        var main = File.ReadAllText(Path.Combine(root, "src/SahamLens.Wpf/MainWindow.cs"));
        var settings = File.ReadAllText(Path.Combine(root, "src/SahamLens.Wpf/Views/SettingsView.cs"));
        Assert.Contains("WorkspaceId.Market or WorkspaceId.Intelligence", main);
        Assert.Contains("new SettingsView(api, sessions)", main);
        Assert.Contains("DPAPI", settings);
        Assert.Contains("/api/desktop/update?current=", settings);
        Assert.Contains("Uri.UriSchemeHttps", settings);
        Assert.Contains("sessions.ClearAsync", settings);
        Assert.DoesNotContain("WebView", settings, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Native_shell_has_no_raw_payload_fallback_and_backtest_uses_real_simulation()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
        var main = File.ReadAllText(Path.Combine(root, "src/SahamLens.Wpf/MainWindow.cs"));
        var backtest = File.ReadAllText(Path.Combine(root, "src/SahamLens.Wpf/Views/BacktestView.cs"));
        Assert.DoesNotContain("DataPreview", main);
        Assert.DoesNotContain("JsonSerializer.Serialize(result.RootElement", main);
        Assert.Contains("new BacktestView(api, ticker)", main);
        Assert.Contains("filters = new[]", backtest);
        Assert.Contains("modal = capital.Value", backtest);
        Assert.Contains("symbol = ticker", backtest);
        Assert.Contains("Simulasi point-in-time", backtest);
        Assert.Equal(9, BacktestFilterCatalog.Names.Count);
    }

    [Fact]
    public async Task Public_GET_falls_back_to_disk_cache_but_private_module_does_not_persist()
    {
        var root = Path.Combine(Path.GetTempPath(), "sahamlens-cache-test-" + Guid.NewGuid());
        try
        {
            var cache = new OfflineResponseCache(root);
            var online = new SahamLensApiClient(new HttpClient(new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"pulse\":\"bullish\"}", Encoding.UTF8, "application/json") })) { BaseAddress = new Uri("https://sahamlens.id") }, new MemorySessionStore(), cache);
            using (var fresh = await online.SendAsync(ProductCatalog.Get("market-pulse"))) Assert.Equal("bullish", fresh.RootElement.GetProperty("pulse").GetString());
            Assert.Equal(1, cache.Count);

            var offline = new SahamLensApiClient(new HttpClient(new ThrowingHandler()) { BaseAddress = new Uri("https://sahamlens.id") }, new MemorySessionStore(), cache);
            using (var cached = await offline.SendAsync(ProductCatalog.Get("market-pulse"))) Assert.Equal("bullish", cached.RootElement.GetProperty("pulse").GetString());

            var store = new MemorySessionStore(); await store.SaveAsync(new Session("user@sahamlens.id", "user", false, "jwt"));
            var privateApi = new SahamLensApiClient(new HttpClient(new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"items\":[]}", Encoding.UTF8, "application/json") })) { BaseAddress = new Uri("https://sahamlens.id") }, store, cache);
            using var _ = await privateApi.SendAsync(ProductCatalog.Get("watchlist"));
            Assert.Equal(1, cache.Count);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [Fact]
    public void Windows_workflow_smoke_tests_window_and_builds_installer()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
        var workflow = File.ReadAllText(Path.Combine(root, "../.github/workflows/desktop-native.yml"));
        Assert.Contains("MainWindowHandle", workflow);
        Assert.Contains("SahamLens.Installer.csproj", workflow);
        Assert.Contains("SahamLens-Native-Setup.exe", workflow);
        Assert.Contains("Get-FileHash", workflow);
        var installer = File.ReadAllText(Path.Combine(root, "installer/SahamLens.Installer.csproj"));
        Assert.Contains("PublishSingleFile", installer);
        Assert.Contains("EmbeddedResource", installer);
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => throw new HttpRequestException("offline");
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => Task.FromResult(responder(request));
    }
}
