using System.Diagnostics;
using System.IO;
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
        Content = new ScrollViewer { Content = body };
        Loaded += async (_, _) => await BuildAsync();
    }

    private async Task BuildAsync()
    {
        body.Children.Clear();
        var session = await sessions.LoadAsync();
        Layout.AddSpaced(body, 12, new TextBlock { Text = "Pengaturan", FontSize = 26, FontWeight = FontWeights.SemiBold });
        Layout.AddSpaced(body, 12, new TextBlock { Text = "Akun, tampilan, cache offline, dan pembaruan aplikasi native.", Opacity = .68 });
        Layout.AddSpaced(body, 12, state);
        Layout.AddSpaced(body, 12, Section("Akun", $"{session.Email ?? "Belum masuk"}\nRole: {session.Role} · Pro: {(session.IsPro ? "Aktif" : "Tidak")}", Button("Keluar dari akun", async () => { await sessions.ClearAsync(); await BuildAsync(); })));

        var themeButtons = Layout.HStack(8,
            Button("Ikuti Windows", () => { ApplyTheme(null); return Task.CompletedTask; }),
            Button("Terang", () => { ApplyTheme(false); return Task.CompletedTask; }),
            Button("Gelap", () => { ApplyTheme(true); return Task.CompletedTask; }));
        Layout.AddSpaced(body, 12, Section("Tema", "Aplikasi ini memakai tema gelap tetap saat ini.", themeButtons));

        Directory.CreateDirectory(LocalDataFolder);
        var fileCount = Directory.GetFiles(LocalDataFolder).Length;
        Layout.AddSpaced(body, 12, Section("Cache lokal", $"{fileCount} berkas aplikasi lokal.", Button("Bersihkan cache", async () =>
        {
            foreach (var file in Directory.GetFiles(LocalDataFolder)) { try { File.Delete(file); } catch { } }
            await BuildAsync();
        })));
        Layout.AddSpaced(body, 12, Section("Pembaruan", $"Versi native {CurrentVersion}", Button("Periksa pembaruan", CheckUpdateAsync)));
        Layout.AddSpaced(body, 12, Section("Privasi", "Token disimpan terenkripsi oleh Windows (DPAPI). Token tidak ditulis ke log atau cache data."));
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
            if (!available) { Show("Aplikasi terbaru", "Tidak ada pembaruan baru.", InfoSeverity.Success); return; }
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
    private static Button Button(string text, Func<Task> action) { var button = new Button { Content = text }; button.Click += async (_, _) => await action(); return button; }
    private static Border Section(string title, string description, UIElement? action = null)
    {
        var panel = Layout.VStack(8,
            new TextBlock { Text = title, FontSize = 18, FontWeight = FontWeights.SemiBold },
            new TextBlock { Text = description, TextWrapping = TextWrapping.Wrap, Opacity = .72 });
        if (action is not null) Layout.AddSpaced(panel, 8, action);
        return new Border { Padding = new Thickness(16), CornerRadius = new CornerRadius(10), Background = (Brush)Application.Current.Resources["CardBrush"], Child = panel };
    }
}
