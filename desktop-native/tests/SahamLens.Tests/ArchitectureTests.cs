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
    public void WinUI_app_qualifies_framework_application_to_avoid_domain_namespace_collision()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
        var source = File.ReadAllText(Path.Combine(root, "src/SahamLens.WinUI/App.xaml.cs"));
        Assert.Contains("Microsoft.UI.Xaml.Application", source);
        Assert.DoesNotContain("class App : Application", source);
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => Task.FromResult(responder(request));
    }
}
