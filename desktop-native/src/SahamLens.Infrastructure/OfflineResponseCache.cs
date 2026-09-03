using System.Security.Cryptography;
using System.Text;

namespace SahamLens.Infrastructure;

public sealed class OfflineResponseCache
{
    private readonly string directory;

    public OfflineResponseCache(string? root = null)
    {
        directory = Path.Combine(root ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SahamLens", "offline-cache");
    }

    public async Task SaveAsync(string key, string json, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(directory);
        await File.WriteAllTextAsync(PathFor(key), json, Encoding.UTF8, cancellationToken);
    }

    public async Task<string?> ReadAsync(string key, CancellationToken cancellationToken)
    {
        var path = PathFor(key);
        return File.Exists(path) ? await File.ReadAllTextAsync(path, cancellationToken) : null;
    }

    public int Count => Directory.Exists(directory) ? Directory.EnumerateFiles(directory, "*.json").Count() : 0;

    public void Clear()
    {
        if (Directory.Exists(directory)) Directory.Delete(directory, true);
    }

    private string PathFor(string key) => Path.Combine(directory, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key))) + ".json");
}
