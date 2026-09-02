using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using SahamLens.Application;
using SahamLens.Domain;

namespace SahamLens.Infrastructure;

public sealed class SahamLensApiClient(HttpClient http, ISessionStore sessions) : ISahamLensApi
{
    public async Task<JsonDocument> SendAsync(ProductModule module, string? ticker = null, object? body = null, CancellationToken cancellationToken = default)
    {
        var session = await sessions.LoadAsync(cancellationToken);
        AccessPolicy.Demand(session, module);
        if (module.RequiresTicker && string.IsNullOrWhiteSpace(ticker)) throw new ArgumentException($"{module.Label} memerlukan ticker.", nameof(ticker));
        var path = module.Endpoint.Replace("{ticker}", Uri.EscapeDataString((ticker ?? string.Empty).Replace(".JK", string.Empty, StringComparison.OrdinalIgnoreCase)));
        return await SendCoreAsync(path, module.Method, body, session.Token, cancellationToken);
    }

    public async Task<JsonDocument> GetAsync(string path, AccessLevel access = AccessLevel.Public, CancellationToken cancellationToken = default)
    {
        var session = await sessions.LoadAsync(cancellationToken);
        if (!AccessPolicy.Allows(session, access)) throw new AccessDeniedException($"Endpoint memerlukan akses {access}.");
        return await SendCoreAsync(path, "GET", null, session.Token, cancellationToken);
    }

    public async Task<Session> LoginAsync(string email, string password, CancellationToken cancellationToken = default)
    {
        using var payload = await SendCoreAsync("/api/auth/desktop/login", "POST", new { email, password }, null, cancellationToken);
        var root = payload.RootElement;
        var token = FindString(root, "token") ?? FindString(root, "accessToken") ?? throw new ApiException(500, "Server tidak mengirim token desktop.");
        var user = root.TryGetProperty("user", out var userNode) ? userNode : root;
        var session = new Session(FindString(user, "email") ?? email, FindString(user, "role") ?? "user", FindBoolean(user, "is_pro") || FindBoolean(user, "isPro"), token);
        await sessions.SaveAsync(session, cancellationToken);
        return session;
    }

    private async Task<JsonDocument> SendCoreAsync(string path, string method, object? body, string? token, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.UserAgent.ParseAdd("SahamLens-Native/1.0");
        if (!string.IsNullOrWhiteSpace(token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null) request.Content = JsonContent.Create(body);
        using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            using var error = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            throw new ApiException((int)response.StatusCode, FindString(error.RootElement, "error") ?? FindString(error.RootElement, "message") ?? $"API gagal ({(int)response.StatusCode}).");
        }
        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    }

    private static string? FindString(JsonElement node, string name) => node.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static bool FindBoolean(JsonElement node, string name) => node.TryGetProperty(name, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False && value.GetBoolean();
}

public sealed class MemorySessionStore : ISessionStore
{
    private Session session = new(null, "guest", false, null);
    public Task<Session> LoadAsync(CancellationToken cancellationToken = default) => Task.FromResult(session);
    public Task SaveAsync(Session value, CancellationToken cancellationToken = default) { session = value; return Task.CompletedTask; }
    public Task ClearAsync(CancellationToken cancellationToken = default) { session = new(null, "guest", false, null); return Task.CompletedTask; }
}
