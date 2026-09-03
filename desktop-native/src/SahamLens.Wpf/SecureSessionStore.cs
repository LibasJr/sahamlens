using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SahamLens.Application;

namespace SahamLens.Wpf;

/// <summary>
/// Replaces the WinUI build's PasswordVault (a UWP/WinRT API) with DPAPI - the
/// standard per-user encryption mechanism for classic unpackaged Win32/.NET desktop
/// apps, with no WinRT activation surface to fail on unusual machines.
/// </summary>
public sealed class SecureSessionStore : ISessionStore
{
    private static readonly string StorePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "SahamLens Native", "session.bin");

    private Session fallback = new(null, "guest", false, null);

    public Task<Session> LoadAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            if (!File.Exists(StorePath)) return Task.FromResult(fallback);
            var protectedBytes = File.ReadAllBytes(StorePath);
            var json = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
            var session = JsonSerializer.Deserialize<Session>(Encoding.UTF8.GetString(json));
            return Task.FromResult(session ?? fallback);
        }
        catch
        {
            return Task.FromResult(fallback);
        }
    }

    public Task SaveAsync(Session session, CancellationToken cancellationToken = default)
    {
        fallback = session;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(StorePath)!);
            var json = JsonSerializer.SerializeToUtf8Bytes(session);
            var protectedBytes = ProtectedData.Protect(json, null, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(StorePath, protectedBytes);
        }
        catch
        {
            // Session still works for this run via the in-memory fallback.
        }
        return Task.CompletedTask;
    }

    public Task ClearAsync(CancellationToken cancellationToken = default)
    {
        fallback = new Session(null, "guest", false, null);
        try
        {
            if (File.Exists(StorePath)) File.Delete(StorePath);
        }
        catch
        {
        }
        return Task.CompletedTask;
    }
}
