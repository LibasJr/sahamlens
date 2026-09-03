using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using SahamLens.Application;
using SahamLens.Domain;
using SahamLens.Wpf.Controls;
using SahamLens.Wpf.Views;

namespace SahamLens.Wpf;

public sealed class MainWindow : Window
{
    private readonly ISahamLensApi api;
    private readonly ISessionStore sessions;
    private WorkspaceId workspace = WorkspaceId.Market;
    private string ticker = "BBCA";

    private readonly StackPanel navPanel = new();
    private readonly Dictionary<WorkspaceId, Button> navButtons = new();
    private readonly TextBox tickerSearch = new() { Width = 280 };
    private readonly Ellipse apiDot = new() { Width = 8, Height = 8, Fill = System.Windows.Media.Brushes.Orange };
    private readonly TextBlock apiStatus = new() { Text = "Memeriksa API" };
    private readonly TextBlock workspaceKicker = new() { Foreground = new SolidColorBrush(Colors.YellowGreen), FontWeight = FontWeights.SemiBold };
    private readonly TextBlock workspaceTitle = new() { FontSize = 28, FontWeight = FontWeights.SemiBold };
    private readonly TextBlock workspaceDescription = new() { MaxWidth = 900, HorizontalAlignment = HorizontalAlignment.Left, TextWrapping = TextWrapping.Wrap, Opacity = 0.7 };
    private readonly WrapPanel moduleBar = new();
    private readonly InfoBar stateBar = new() { IsOpen = false, IsClosable = false };
    private readonly LoadingRing loading = new();
    private readonly ContentControl nativeContent = new();

    public MainWindow(ISahamLensApi api, ISessionStore sessions)
    {
        this.api = api;
        this.sessions = sessions;
        Title = "SahamLens Native";
        Width = 1280;
        Height = 800;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        BuildShell();
        ContentRendered += OnFirstRender;
    }

    private async void OnFirstRender(object? sender, EventArgs e)
    {
        ContentRendered -= OnFirstRender;
        await InitializeAsync();
    }

    private void BuildShell()
    {
        foreach (var (id, label) in new[]
        {
            (WorkspaceId.Market, "Pasar Hari Ini"),
            (WorkspaceId.Screener, "Screener"),
            (WorkspaceId.Analysis, "Analisis Emiten"),
            (WorkspaceId.Intelligence, "Market Intelligence"),
            (WorkspaceId.Research, "Riset Emiten"),
            (WorkspaceId.Admin, "Admin Panel"),
            (WorkspaceId.Settings, "Pengaturan"),
        })
        {
            var button = new Button { Content = label, HorizontalContentAlignment = HorizontalAlignment.Left, Margin = new Thickness(0, 0, 0, 4) };
            var capturedId = id;
            button.Click += (_, _) => SelectWorkspace(capturedId);
            if (id == WorkspaceId.Admin) button.Visibility = Visibility.Collapsed;
            navButtons[id] = button;
            navPanel.Children.Add(button);
        }
        var pane = new Border
        {
            Width = 245,
            Background = (Brush)System.Windows.Application.Current.Resources["CardBrush"],
            Padding = new Thickness(12),
            Child = Layout.VStack(4,
                new TextBlock { Text = "SAHAMLENS", FontWeight = FontWeights.Bold, FontSize = 20 },
                new TextBlock { Text = "Native Research Terminal", Opacity = 0.65, FontSize = 11, Margin = new Thickness(0, 0, 0, 16) },
                navPanel),
        };

        tickerSearch.KeyDown += OnTickerKeyDown;
        var accountButton = new Button { Content = "Akun" };
        accountButton.Click += OnAccountClick;
        var statusChip = new Border { CornerRadius = new CornerRadius(12), Padding = new Thickness(10, 6, 10, 6), Background = (Brush)System.Windows.Application.Current.Resources["AppBackgroundBrush"], Margin = new Thickness(14, 0, 14, 0) };
        statusChip.Child = Layout.HStack(7, apiDot, apiStatus);

        var header = new Grid();
        header.ColumnDefinitions.Add(new ColumnDefinition());
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(statusChip, 1); Grid.SetColumn(accountButton, 2);
        header.Children.Add(tickerSearch); header.Children.Add(statusChip); header.Children.Add(accountButton);
        var headerBorder = new Border { Padding = new Thickness(20, 12, 20, 12), Child = header };

        var body = Layout.VStack(16, workspaceKicker, workspaceTitle, workspaceDescription, moduleBar, stateBar, loading, nativeContent);
        body.Margin = new Thickness(24);
        var scroll = new ScrollViewer { Content = body };
        Grid.SetRow(scroll, 1);

        var contentArea = new Grid();
        contentArea.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        contentArea.RowDefinitions.Add(new RowDefinition());
        contentArea.Children.Add(headerBorder);
        contentArea.Children.Add(scroll);
        Grid.SetColumn(contentArea, 1);

        var root = new Grid();
        root.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        root.ColumnDefinitions.Add(new ColumnDefinition());
        root.Children.Add(pane);
        root.Children.Add(contentArea);
        Content = root;
    }

    private async Task InitializeAsync()
    {
        await RefreshSessionAsync();
        await CheckHealthAsync();
        SelectWorkspace(WorkspaceId.Market);
    }

    private async Task CheckHealthAsync()
    {
        try
        {
            using var _ = await api.GetAsync("/api/health");
            apiStatus.Text = "API tersambung";
            apiDot.Fill = System.Windows.Media.Brushes.LimeGreen;
        }
        catch
        {
            apiStatus.Text = "API offline";
            apiDot.Fill = System.Windows.Media.Brushes.OrangeRed;
        }
    }

    private async Task RefreshSessionAsync()
    {
        var session = await sessions.LoadAsync();
        navButtons[WorkspaceId.Admin].Visibility = session.IsAdmin ? Visibility.Visible : Visibility.Collapsed;
    }

    private void SelectWorkspace(WorkspaceId selected)
    {
        workspace = selected;
        foreach (var (id, button) in navButtons)
            button.FontWeight = id == selected ? FontWeights.Bold : FontWeights.Normal;

        var titles = new Dictionary<WorkspaceId, (string Kicker, string Title, string Description)>
        {
            [WorkspaceId.Market] = ("PASAR HARI INI", "Kondisi pasar dalam satu halaman", "IHSG, breadth, sektor, movers, sentimen, dan daftar pantau."),
            [WorkspaceId.Screener] = ("SCREENER", "Saring kandidat riset", "Hasil penuh mengikuti akun dan role native yang sedang aktif."),
            [WorkspaceId.Analysis] = ("ANALISIS EMITEN", ticker, "Chart, fundamental, valuasi, earnings, ownership, backtest, dan compare."),
            [WorkspaceId.Intelligence] = ("MARKET INTELLIGENCE", "Konteks pasar terbaru", "News, pulse, makro, kalender, dan breakout radar."),
            [WorkspaceId.Research] = ("RISET EMITEN", ticker, "Consensus Lens AI, bandarmology, checklist, position sizing, dividend, dan risk."),
            [WorkspaceId.Admin] = ("ADMIN CONSOLE", "Operasional platform", "Seluruh modul admin native dengan role gate server dan client."),
            [WorkspaceId.Settings] = ("PENGATURAN", "Akun & aplikasi", "Sesi aman Windows, cache, dan pembaruan aplikasi."),
        };
        var text = titles[selected]; workspaceKicker.Text = text.Kicker; workspaceTitle.Text = text.Title; workspaceDescription.Text = text.Description;
        moduleBar.Children.Clear();
        foreach (var module in ProductCatalog.For(selected))
        {
            var button = new Button { Content = module.Label, Margin = new Thickness(0, 0, 8, 8) };
            button.Click += async (_, _) => await LoadModuleAsync(module);
            moduleBar.Children.Add(button);
        }
        nativeContent.Content = selected == WorkspaceId.Screener ? new ScreenerView(api) : null;
        if (selected == WorkspaceId.Settings) nativeContent.Content = new SettingsView(api, sessions);
        stateBar.IsOpen = false;
    }

    private async Task LoadModuleAsync(ProductModule module)
    {
        loading.IsActive = true; stateBar.IsOpen = false; nativeContent.Content = null;
        try
        {
            if (module.Workspace == WorkspaceId.Admin) nativeContent.Content = new AdminModuleView(api, module);
            else if (module.Id == "news") nativeContent.Content = new NewsView(api);
            else if (module.Id == "backtest") nativeContent.Content = new BacktestView(api, ticker);
            else if (module.Id == "technical")
            {
                var chartModule = ProductCatalog.Get("technical");
                var result = await api.SendAsync<ChartResult>(chartModule, ticker);
                var chart = new NativeChartControl(); chart.SetData(ticker, result.History, false); nativeContent.Content = chart;
            }
            else if (module.Workspace is WorkspaceId.Analysis or WorkspaceId.Research)
                nativeContent.Content = new StructuredModuleView(api, module, ticker);
            else if (module.Workspace is WorkspaceId.Market or WorkspaceId.Intelligence)
                nativeContent.Content = new StructuredModuleView(api, module, ticker);
            else if (module.Workspace == WorkspaceId.Settings) nativeContent.Content = new SettingsView(api, sessions);
            else throw new InvalidOperationException($"Renderer native {module.Id} belum terdaftar.");
            stateBar.Severity = InfoSeverity.Success; stateBar.Title = module.Label; stateBar.Message = "Data API berhasil dimuat."; stateBar.IsOpen = true;
        }
        catch (AccessDeniedException error)
        {
            stateBar.Severity = InfoSeverity.Warning; stateBar.Title = "Akses akun diperlukan"; stateBar.Message = error.Message; stateBar.IsOpen = true;
        }
        catch (Exception error)
        {
            stateBar.Severity = InfoSeverity.Error; stateBar.Title = $"{module.Label} gagal dimuat"; stateBar.Message = error.Message; stateBar.IsOpen = true;
        }
        finally { loading.IsActive = false; }
    }

    private void OnTickerKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter) return;
        var value = tickerSearch.Text.Trim().ToUpperInvariant().Replace(".JK", string.Empty);
        if (value.Length is < 2 or > 12 || value.Any(ch => !char.IsLetterOrDigit(ch))) return;
        ticker = value;
        if (workspace is WorkspaceId.Analysis or WorkspaceId.Research) SelectWorkspace(workspace);
    }

    private async void OnAccountClick(object sender, RoutedEventArgs e)
    {
        var dialog = new LoginWindow(api) { Owner = this };
        if (dialog.ShowDialog() == true) await RefreshSessionAsync();
    }
}
