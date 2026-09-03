using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using SahamLens.Application;
using SahamLens.Domain;
using SahamLens.WinUI.Controls;
using SahamLens.WinUI.Views;

namespace SahamLens.WinUI;

public sealed partial class MainWindow : Window
{
    private readonly ISahamLensApi api;
    private readonly ISessionStore sessions;
    private WorkspaceId workspace = WorkspaceId.Market;
    private string ticker = "BBCA";

    public MainWindow(ISahamLensApi api, ISessionStore sessions)
    {
        this.api = api;
        this.sessions = sessions;
        InitializeComponent();
        Activated += async (_, _) => await InitializeAsync();
    }

    private async Task InitializeAsync()
    {
        Activated -= async (_, _) => await InitializeAsync();
        await RefreshSessionAsync();
        await CheckHealthAsync();
        SelectWorkspace(WorkspaceId.Market);
    }

    private async Task CheckHealthAsync()
    {
        try
        {
            using var _ = await api.GetAsync("/api/health");
            ApiStatus.Text = "API tersambung";
            ApiDot.Fill = new SolidColorBrush(Colors.LimeGreen);
        }
        catch
        {
            ApiStatus.Text = "API offline";
            ApiDot.Fill = new SolidColorBrush(Colors.OrangeRed);
        }
    }

    private async Task RefreshSessionAsync()
    {
        var session = await sessions.LoadAsync();
        AdminItem.Visibility = session.IsAdmin ? Visibility.Visible : Visibility.Collapsed;
    }

    private void OnNavigationChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.IsSettingsSelected) { SelectWorkspace(WorkspaceId.Settings); return; }
        if (args.SelectedItemContainer?.Tag is string tag && Enum.TryParse<WorkspaceId>(tag, out var selected)) SelectWorkspace(selected);
    }

    private void SelectWorkspace(WorkspaceId selected)
    {
        workspace = selected;
        var titles = new Dictionary<WorkspaceId, (string Kicker, string Title, string Description)>
        {
            [WorkspaceId.Market] = ("PASAR HARI INI", "Kondisi pasar dalam satu halaman", "IHSG, breadth, sektor, movers, sentimen, dan daftar pantau."),
            [WorkspaceId.Screener] = ("SCREENER", "Saring kandidat riset", "Hasil penuh mengikuti akun dan role native yang sedang aktif."),
            [WorkspaceId.Analysis] = ("ANALISIS EMITEN", ticker, "Chart, fundamental, valuasi, earnings, ownership, backtest, dan compare."),
            [WorkspaceId.Intelligence] = ("MARKET INTELLIGENCE", "Konteks pasar terbaru", "News, pulse, makro, kalender, dan breakout radar."),
            [WorkspaceId.Research] = ("RISET EMITEN", ticker, "Consensus Lens AI, bandarmology, checklist, position sizing, dividend, dan risk."),
            [WorkspaceId.Admin] = ("ADMIN CONSOLE", "Operasional platform", "Seluruh modul admin native dengan role gate server dan client."),
            [WorkspaceId.Settings] = ("PENGATURAN", "Akun & aplikasi", "Sesi aman Windows, tema, cache, dan pembaruan aplikasi.")
        };
        var text = titles[selected]; WorkspaceKicker.Text = text.Kicker; WorkspaceTitle.Text = text.Title; WorkspaceDescription.Text = text.Description;
        ModuleBar.PrimaryCommands.Clear();
        foreach (var module in ProductCatalog.For(selected))
        {
            var button = new AppBarButton { Label = module.Label, Tag = module.Id, Icon = new SymbolIcon(Symbol.Refresh) };
            button.Click += async (_, _) => await LoadModuleAsync(module);
            ModuleBar.PrimaryCommands.Add(button);
        }
        NativeContent.Content = selected == WorkspaceId.Screener ? new ScreenerView(api) : null;
        if (selected == WorkspaceId.Settings) NativeContent.Content = new SettingsView(api, sessions);
        StateBar.IsOpen = false;
    }

    private async Task LoadModuleAsync(ProductModule module)
    {
        Loading.IsActive = true; StateBar.IsOpen = false; NativeContent.Content = null;
        try
        {
            if (module.Workspace == WorkspaceId.Admin) NativeContent.Content = new AdminModuleView(api, module);
            else if (module.Id == "news") NativeContent.Content = new NewsView(api);
            else if (module.Id == "backtest") NativeContent.Content = new BacktestView(api, ticker);
            else if (module.Id == "technical")
            {
                var chartModule = ProductCatalog.Get("technical");
                var result = await api.SendAsync<ChartResult>(chartModule, ticker);
                var chart = new NativeChartControl(); chart.SetData(ticker, result.History, false); NativeContent.Content = chart;
            }
            else if (module.Workspace is WorkspaceId.Analysis or WorkspaceId.Research)
                NativeContent.Content = new StructuredModuleView(api, module, ticker);
            else if (module.Workspace is WorkspaceId.Market or WorkspaceId.Intelligence)
                NativeContent.Content = new StructuredModuleView(api, module, ticker);
            else if (module.Workspace == WorkspaceId.Settings) NativeContent.Content = new SettingsView(api, sessions);
            else throw new InvalidOperationException($"Renderer native {module.Id} belum terdaftar.");
            StateBar.Severity = InfoBarSeverity.Success; StateBar.Title = module.Label; StateBar.Message = "Data API berhasil dimuat."; StateBar.IsOpen = true;
        }
        catch (AccessDeniedException error)
        {
            StateBar.Severity = InfoBarSeverity.Warning; StateBar.Title = "Akses akun diperlukan"; StateBar.Message = error.Message; StateBar.IsOpen = true;
        }
        catch (Exception error)
        {
            StateBar.Severity = InfoBarSeverity.Error; StateBar.Title = $"{module.Label} gagal dimuat"; StateBar.Message = error.Message; StateBar.IsOpen = true;
        }
        finally { Loading.IsActive = false; }
    }

    private void OnTickerSubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        var value = (args.QueryText ?? string.Empty).Trim().ToUpperInvariant().Replace(".JK", string.Empty);
        if (value.Length is < 2 or > 12 || value.Any(ch => !char.IsLetterOrDigit(ch))) return;
        ticker = value;
        if (workspace is WorkspaceId.Analysis or WorkspaceId.Research) SelectWorkspace(workspace);
    }

    private async void OnAccountClick(object sender, RoutedEventArgs e)
    {
        var dialog = new LoginDialog(api) { XamlRoot = Content.XamlRoot };
        if (await dialog.ShowAsync() == ContentDialogResult.Primary) await RefreshSessionAsync();
    }
}
