using System.Text.Json;
using SahamLens.Application;
using Windows.Security.Credentials;

namespace SahamLens.WinUI;

public sealed class WindowsSessionStore : ISessionStore
{
    private const string Resource = "SahamLens.Native.Session";
    private Session fallback = new(null, "guest", false, null);

    public Task<Session> LoadAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var vault = new PasswordVault();
            var credential = vault.FindAllByResource(Resource).FirstOrDefault();
            if (credential is null) return Task.FromResult(fallback);
            credential.RetrievePassword();
            return Task.FromResult(JsonSerializer.Deserialize<Session>(credential.Password) ?? fallback);
        }
        catch { return Task.FromResult(fallback); }
    }

    public Task SaveAsync(Session session, CancellationToken cancellationToken = default)
    {
        fallback = session;
        try
        {
            var vault = new PasswordVault();
            foreach (var existing in vault.RetrieveAll().Where(x => x.Resource == Resource)) vault.Remove(existing);
            vault.Add(new PasswordCredential(Resource, session.Email ?? "account", JsonSerializer.Serialize(session)));
        }
        catch { }
        return Task.CompletedTask;
    }

    public Task ClearAsync(CancellationToken cancellationToken = default)
    {
        fallback = new(null, "guest", false, null);
        try
        {
            var vault = new PasswordVault();
            foreach (var existing in vault.RetrieveAll().Where(x => x.Resource == Resource)) vault.Remove(existing);
        }
        catch { }
        return Task.CompletedTask;
    }
}
