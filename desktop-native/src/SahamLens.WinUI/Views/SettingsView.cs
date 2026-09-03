using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SahamLens.Application;
using Windows.Storage;
using Windows.System;

namespace SahamLens.WinUI.Views;

public sealed class SettingsView : UserControl
{
    private const string CurrentVersion = "2.0.0";
    private readonly ISahamLensApi api;
    private readonly ISessionStore sessions;
    private readonly StackPanel body = new() { Spacing = 12 };
    private readonly InfoBar state = new() { IsOpen = false, IsClosable = true };

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
        body.Children.Add(new TextBlock { Text = "Pengaturan", FontSize = 26, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        body.Children.Add(new TextBlock { Text = "Akun, tampilan, cache offline, dan pembaruan aplikasi native.", Opacity = .68 });
        body.Children.Add(state);
        body.Children.Add(Section("Akun", $"{session.Email ?? "Belum masuk"}\nRole: {session.Role} · Pro: {(session.IsPro ? "Aktif" : "Tidak")}", Button("Keluar dari akun", async () => { await sessions.ClearAsync(); await BuildAsync(); })));

        var themeButtons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        foreach (var (label, theme) in new[] { ("Ikuti Windows", ElementTheme.Default), ("Terang", ElementTheme.Light), ("Gelap", ElementTheme.Dark) })
            themeButtons.Children.Add(Button(label, () => { RequestedTheme = theme; return Task.CompletedTask; }));
        body.Children.Add(Section("Tema", "Gunakan tema native Windows tanpa stylesheet browser.", themeButtons));

        var local = ApplicationData.Current.LocalFolder;
        var files = await local.GetFilesAsync();
        body.Children.Add(Section("Cache lokal", $"{files.Count} berkas aplikasi lokal.", Button("Bersihkan cache", async () => { foreach (var file in await local.GetFilesAsync()) await file.DeleteAsync(); await BuildAsync(); })));
        body.Children.Add(Section("Pembaruan", $"Versi native {CurrentVersion}", Button("Periksa pembaruan", CheckUpdateAsync)));
        body.Children.Add(Section("Privasi", "Token disimpan oleh Windows Password Vault. Token tidak ditulis ke log atau cache data."));
    }

    private async Task CheckUpdateAsync()
    {
        try
        {
            using var document = await api.GetAsync($"/api/desktop/update?current={CurrentVersion}");
            var root = document.RootElement;
            var available = root.TryGetProperty("available", out var node) && node.GetBoolean();
            if (!available) { Show("Aplikasi terbaru", "Tidak ada pembaruan baru.", InfoBarSeverity.Success); return; }
            var url = root.GetProperty("downloadUrl").GetString();
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) throw new InvalidOperationException("URL pembaruan tidak valid.");
            var dialog = new ContentDialog { XamlRoot = XamlRoot, Title = $"Pembaruan {root.GetProperty("version").GetString()}", Content = root.TryGetProperty("notes", out var notes) ? notes.GetString() : "Versi baru tersedia.", PrimaryButtonText = "Unduh & pasang", CloseButtonText = "Nanti" };
            if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
            var target = await ApplicationData.Current.TemporaryFolder.CreateFileAsync("SahamLens-Update.exe", CreationCollisionOption.ReplaceExisting);
            using var client = new HttpClient(); using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead); response.EnsureSuccessStatusCode();
            await using (var output = await target.OpenStreamForWriteAsync()) await response.Content.CopyToAsync(output);
            await Launcher.LaunchFileAsync(target);
        }
        catch (Exception error) { Show("Pembaruan gagal", error.Message, InfoBarSeverity.Error); }
    }

    private void Show(string title, string message, InfoBarSeverity severity) { state.Title = title; state.Message = message; state.Severity = severity; state.IsOpen = true; }
    private static Button Button(string text, Func<Task> action) { var button = new Button { Content = text }; button.Click += async (_, _) => await action(); return button; }
    private static Border Section(string title, string description, UIElement? action = null)
    {
        var panel = new StackPanel { Spacing = 8, Children = { new TextBlock { Text = title, FontSize = 18, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold }, new TextBlock { Text = description, TextWrapping = TextWrapping.Wrap, Opacity = .72 } } };
        if (action is not null) panel.Children.Add(action);
        return new Border { Padding = new Thickness(16), CornerRadius = new CornerRadius(10), Background = (Microsoft.UI.Xaml.Media.Brush)Microsoft.UI.Xaml.Application.Current.Resources["CardBrush"], Child = panel };
    }
}
