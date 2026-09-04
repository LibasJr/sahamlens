using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using SahamLens.Application;
using SahamLens.Wpf.Controls;

namespace SahamLens.Wpf.Views;

public sealed class SettingsView : UserControl
{
    private const string CurrentVersion = "2.0.0";
    private readonly ISahamLensApi api;
    private readonly ISessionStore sessions;
    private readonly StackPanel body = new();
    private readonly InfoBar state = new() { IsOpen = false, IsClosable = true };

    private static readonly string LocalDataFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SahamLens Native");

    public SettingsView(ISahamLensApi api, ISessionStore sessions)
    {
        this.api = api; this.sessions = sessions;
        Content = new ScrollViewer { Content = body, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        Loaded += async (_, _) => await BuildAsync();
    }

    private async Task BuildAsync()
    {
        body.Children.Clear();
        var session = await sessions.LoadAsync();
        Layout.AddSpaced(body, 6, new TextBlock { Text = "Pengaturan & Preferensi Sistem", FontSize = 22, FontWeight = FontWeights.Bold, Foreground = Theme.Foreground });
        Layout.AddSpaced(body, 14, new TextBlock { Text = "Manajemen akun, konfigurasi tampilan, cache offline, serta pembaruan aplikasi native.", Foreground = Theme.SecondaryForeground, FontSize = 13 });
        Layout.AddSpaced(body, 12, state);

        // Akun Section
        var accountInfo = $"{session.Email ?? "Belum masuk ke akun SahamLens"}\nStatus Role: {session.Role.ToUpperInvariant()}  •  Status Pro: {(session.IsPro ? "Aktif" : "Non-Aktif")}";
        var logoutBtn = Theme.SecondaryButton("Keluar dari Akun");
        logoutBtn.Click += async (_, _) => { await sessions.ClearAsync(); await BuildAsync(); };
        Layout.AddSpaced(body, 12, Section("Akun & Autentikasi", accountInfo, logoutBtn));

        // Tema Section
        var themeButtons = Layout.HStack(8,
            Theme.SecondaryButton("Ikuti Windows"),
            Theme.SecondaryButton("Terang"),
            Theme.PrimaryButton("Gelap (Aktif)"));
        Layout.AddSpaced(body, 12, Section("Tampilan & Tema", "Aplikasi terminal ini berjalan dengan palet tema gelap kontras tinggi yang dioptimalkan untuk analisis intensif.", themeButtons));

        // Cache Section
        Directory.CreateDirectory(LocalDataFolder);
        var fileCount = Directory.GetFiles(LocalDataFolder).Length;
        var clearCacheBtn = Theme.SecondaryButton("Bersihkan Cache");
        clearCacheBtn.Click += async (_, _) =>
        {
            foreach (var file in Directory.GetFiles(LocalDataFolder)) { try { File.Delete(file); } catch { } }
            await BuildAsync();
        };
        Layout.AddSpaced(body, 12, Section("Penyimpanan Cache Offline", $"{fileCount} berkas data lokal tersimpan di disk pengguna untuk fallback offline.", clearCacheBtn));

        // Update Section
        var updateBtn = Theme.PrimaryButton("Periksa Pembaruan");
        updateBtn.Click += async (_, _) => await CheckUpdateAsync();
        Layout.AddSpaced(body, 12, Section("Pembaruan Aplikasi", $"Versi Native saat ini: v{CurrentVersion} (WPF x64)", updateBtn));

        // Privasi Section
        Layout.AddSpaced(body, 12, Section("Keamanan & Privasi Data", "Kredensial dan sesi akun dienkripsi secara lokal oleh Windows Data Protection API (DPAPI). Tidak ada token yang ditulis ke log sistem atau cache tidak aman."));
    }

    private static void ApplyTheme(bool? dark)
    {
        // This build ships one fixed dark palette (see App.xaml); theme switching is not wired yet.
    }

    private async Task CheckUpdateAsync()
    {
        try
        {
            using var document = await api.GetAsync($"/api/desktop/update?current={CurrentVersion}");
            var root = document.RootElement;
            var available = root.TryGetProperty("available", out var node) && node.GetBoolean();
            if (!available) { Show("Aplikasi terbaru", "Aplikasi SahamLens Native sudah versi terbaru.", InfoSeverity.Success); return; }
            var url = root.GetProperty("downloadUrl").GetString();
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) throw new InvalidOperationException("URL pembaruan tidak valid.");
            var version = root.GetProperty("version").GetString();
            var notes = root.TryGetProperty("notes", out var notesNode) ? notesNode.GetString() : "Versi baru tersedia.";
            var confirmed = MessageBox.Show($"{notes}\n\nUnduh dan pasang versi {version} sekarang?", $"Pembaruan {version}", MessageBoxButton.YesNo, MessageBoxImage.Information) == MessageBoxResult.Yes;
            if (!confirmed) return;
            var target = Path.Combine(Path.GetTempPath(), "SahamLens-Update.exe");
            using var client = new HttpClient();
            using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();
            await using (var output = File.Create(target)) await response.Content.CopyToAsync(output);
            Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
        }
        catch (Exception error) { Show("Pembaruan gagal", error.Message, InfoSeverity.Error); }
    }

    private void Show(string title, string message, InfoSeverity severity) { state.Title = title; state.Message = message; state.Severity = severity; state.IsOpen = true; }

    private static Border Section(string title, string description, UIElement? action = null)
    {
        var panel = Layout.VStack(8,
            new TextBlock { Text = title, FontSize = 16, FontWeight = FontWeights.Bold, Foreground = Theme.Foreground },
            new TextBlock { Text = description, TextWrapping = TextWrapping.Wrap, Foreground = Theme.SecondaryForeground, FontSize = 13, LineHeight = 19 });
        if (action is not null) Layout.AddSpaced(panel, 10, action);
        return Theme.CardContainer(panel, new Thickness(18, 14, 18, 14));
    }
}
