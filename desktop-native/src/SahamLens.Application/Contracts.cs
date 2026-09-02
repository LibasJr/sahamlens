using System.Text.Json;
using SahamLens.Domain;

namespace SahamLens.Application;

public sealed record Session(string? Email, string Role, bool IsPro, string? Token)
{
    public bool Authenticated => !string.IsNullOrWhiteSpace(Token);
    public bool IsAdmin => string.Equals(Role, "admin", StringComparison.OrdinalIgnoreCase);
    public AccessLevel Level => IsAdmin ? AccessLevel.Admin : IsPro ? AccessLevel.Pro : Authenticated ? AccessLevel.Account : AccessLevel.Public;
}

public interface ISessionStore
{
    Task<Session> LoadAsync(CancellationToken cancellationToken = default);
    Task SaveAsync(Session session, CancellationToken cancellationToken = default);
    Task ClearAsync(CancellationToken cancellationToken = default);
}

public interface ISahamLensApi
{
    Task<JsonDocument> SendAsync(ProductModule module, string? ticker = null, object? body = null, CancellationToken cancellationToken = default);
    Task<Session> LoginAsync(string email, string password, CancellationToken cancellationToken = default);
    Task<JsonDocument> GetAsync(string path, AccessLevel access = AccessLevel.Public, CancellationToken cancellationToken = default);
}

public sealed class AccessDeniedException(string message) : Exception(message);
public sealed class ApiException(int statusCode, string message) : Exception(message) { public int StatusCode { get; } = statusCode; }

public static class AccessPolicy
{
    public static bool Allows(Session session, AccessLevel required) => required switch
    {
        AccessLevel.Public => true,
        AccessLevel.Account => session.Authenticated,
        AccessLevel.Pro => session.IsPro || session.IsAdmin,
        AccessLevel.Admin => session.IsAdmin,
        _ => false
    };

    public static void Demand(Session session, ProductModule module)
    {
        if (!Allows(session, module.Access)) throw new AccessDeniedException($"{module.Label} memerlukan akses {module.Access}.");
    }
}
