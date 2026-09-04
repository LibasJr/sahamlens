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
    private readonly Dictionary<WorkspaceId, Border> navButtons = new();
    private readonly TextBox tickerSearch = Theme.Field(new TextBox { Width = 260, Height = 36, VerticalContentAlignment = VerticalAlignment.Center });
    private readonly Ellipse apiDot = new() { Width = 8, Height = 8, Fill = Theme.Warning };
    private readonly TextBlock apiStatus = new() { Text = "Memeriksa API", FontSize = 12, Foreground = Theme.SecondaryForeground };
    private readonly TextBlock workspaceKicker = new() { Foreground = Theme.Accent, FontWeight = FontWeights.Bold, FontSize = 11 };
    private readonly TextBlock workspaceTitle = new() { FontSize = 26, FontWeight = FontWeights.Bold, Foreground = Theme.Foreground };
    private readonly TextBlock workspaceDescription = new() { MaxWidth = 960, HorizontalAlignment = HorizontalAlignment.Left, TextWrapping = TextWrapping.Wrap, Foreground = Theme.SecondaryForeground, FontSize = 13, LineHeight = 20 };
    private readonly WrapPanel moduleBar = new();
    private readonly InfoBar stateBar = new() { IsOpen = false, IsClosable = false };
    private readonly LoadingRing loading = new();
    private readonly ContentControl nativeContent = new();
    private readonly TextBlock accountEmailText = new() { Text = "Masuk", FontSize = 12, FontWeight = FontWeights.SemiBold, Foreground = Theme.Foreground };

    public MainWindow(ISahamLensApi api, ISessionStore sessions)
    {
        this.api = api;
        this.sessions = sessions;
        Title = "SahamLens Native Terminal";
        Width = 1360;
        Height = 860;
        MinWidth = 1080;
        MinHeight = 700;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = Theme.Background;
        Foreground = Theme.Foreground;
        FontFamily = Theme.PrimaryFont;
        FontSize = 13;
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
        // Sidebar Branding
        var logoSymbol = new Border
        {
            Width = 32,
            Height = 32,
            CornerRadius = new CornerRadius(8),
            Background = Theme.Accent,
            Child = new TextBlock
            {
                Text = "S",
                FontWeight = FontWeights.ExtraBold,
                FontSize = 18,
                Foreground = Theme.AccentForeground,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            }
        };

        var logoText = Layout.VStack(2,
            new TextBlock { Text = "SAHAMLENS", FontWeight = FontWeights.Bold, FontSize = 16, Foreground = Theme.Foreground },
            new TextBlock { Text = "Native Terminal", FontSize = 11, Foreground = Theme.SubtleForeground });

        var brandHeader = Layout.HStack(12, logoSymbol, logoText);
        brandHeader.Margin = new Thickness(6, 4, 6, 20);

        // Sidebar Menu Items
        var menuItems = new[]
        {
            (WorkspaceId.Market, "Pasar Hari Ini", "📊"),
            (WorkspaceId.Screener, "Screener", "🔍"),
            (WorkspaceId.Analysis, "Analisis Emiten", "📈"),
            (WorkspaceId.Intelligence, "Market Intelligence", "🧠"),
            (WorkspaceId.Research, "Riset Emiten", "🔬"),
            (WorkspaceId.Admin, "Admin Panel", "🛡️"),
            (WorkspaceId.Settings, "Pengaturan", "⚙️"),
        };

        foreach (var (id, label, icon) in menuItems)
        {
            var itemGrid = new Grid();
            itemGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
            itemGrid.ColumnDefinitions.Add(new ColumnDefinition());

            var iconText = new TextBlock { Text = icon, FontSize = 14, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Center };
            var labelText = new TextBlock { Text = label, FontSize = 13, FontWeight = FontWeights.Normal, Foreground = Theme.SecondaryForeground, VerticalAlignment = VerticalAlignment.Center };

            Grid.SetColumn(iconText, 0);
            Grid.SetColumn(labelText, 1);
            itemGrid.Children.Add(iconText);
            itemGrid.Children.Add(labelText);

            var itemBorder = new Border
            {
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(10, 8, 10, 8),
                Margin = new Thickness(0, 0, 0, 4),
                Background = Brushes.Transparent,
                Cursor = Cursors.Hand,
                Child = itemGrid
            };

            var capturedId = id;
            itemBorder.MouseEnter += (_, _) =>
            {
                if (workspace != capturedId)
                    itemBorder.Background = Theme.Solid(0x18, 0x22, 0x26);
            };
            itemBorder.MouseLeave += (_, _) =>
            {
                if (workspace != capturedId)
                    itemBorder.Background = Brushes.Transparent;
            };
            itemBorder.MouseDown += (_, _) => SelectWorkspace(capturedId);

            if (id == WorkspaceId.Admin) itemBorder.Visibility = Visibility.Collapsed;
            navButtons[id] = itemBorder;
            navPanel.Children.Add(itemBorder);
        }

        var pane = new Border
        {
            Width = 240,
            Background = Theme.SidebarBackground,
            BorderBrush = Theme.Border,
            BorderThickness = new Thickness(0, 0, 1, 0),
            Padding = new Thickness(16, 20, 16, 20),
            Child = Layout.VStack(8, brandHeader, navPanel)
        };

        // Top Header
        tickerSearch.KeyDown += OnTickerKeyDown;

        var searchBoxContainer = new Border
        {
            CornerRadius = new CornerRadius(8),
            Child = tickerSearch
        };

        var statusChip = new Border
        {
            CornerRadius = new CornerRadius(999),
            Padding = new Thickness(12, 6, 12, 6),
            Background = Theme.Solid(0x13, 0x1A, 0x1D),
            BorderBrush = Theme.Border,
            BorderThickness = new Thickness(1),
            Margin = new Thickness(14, 0, 14, 0),
            VerticalAlignment = VerticalAlignment.Center
        };
        statusChip.Child = Layout.HStack(8, apiDot, apiStatus);

        var accountBtnContainer = new Border
        {
            CornerRadius = new CornerRadius(8),
            Background = Theme.ButtonBackground,
            BorderBrush = Theme.Border,
            BorderThickness = new Thickness(1),
            Padding = new Thickness(12, 6, 14, 6),
            Cursor = Cursors.Hand,
            VerticalAlignment = VerticalAlignment.Center
        };
        accountBtnContainer.MouseEnter += (_, _) => accountBtnContainer.Background = Theme.ButtonHoverBackground;
        accountBtnContainer.MouseLeave += (_, _) => accountBtnContainer.Background = Theme.ButtonBackground;
        accountBtnContainer.MouseDown += OnAccountClick;
        accountBtnContainer.Child = Layout.HStack(8,
            new TextBlock { Text = "👤", FontSize = 12, VerticalAlignment = VerticalAlignment.Center },
            accountEmailText);

        var header = new Grid();
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        header.ColumnDefinitions.Add(new ColumnDefinition());
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        Grid.SetColumn(searchBoxContainer, 0);
        Grid.SetColumn(statusChip, 2);
        Grid.SetColumn(accountBtnContainer, 3);
        header.Children.Add(searchBoxContainer);
        header.Children.Add(statusChip);
        header.Children.Add(accountBtnContainer);

        var headerBorder = new Border
        {
            Padding = new Thickness(24, 14, 24, 14),
            Background = Theme.HeaderBackground,
            BorderBrush = Theme.Border,
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = header
        };

        // Main Body Content
        var titleCard = Layout.VStack(6, workspaceKicker, workspaceTitle, workspaceDescription);
        var body = Layout.VStack(16, titleCard, moduleBar, stateBar, loading, nativeContent);
        body.Margin = new Thickness(28);

        var scroll = new ScrollViewer
        {
            Content = body,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled
        };
        Grid.SetRow(scroll, 1);

        var contentArea = new Grid();
        contentArea.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        contentArea.RowDefinitions.Add(new RowDefinition());
        contentArea.Children.Add(headerBorder);
        contentArea.Children.Add(scroll);
        Grid.SetColumn(contentArea, 1);

        var root = new Grid { Background = Theme.Background };
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
            apiDot.Fill = Theme.Positive;
        }
        catch
        {
            apiStatus.Text = "API offline";
            apiDot.Fill = Theme.Negative;
        }
    }

    private async Task RefreshSessionAsync()
    {
        var session = await sessions.LoadAsync();
        navButtons[WorkspaceId.Admin].Visibility = session.IsAdmin ? Visibility.Visible : Visibility.Collapsed;
        accountEmailText.Text = string.IsNullOrWhiteSpace(session.Email) ? "Masuk" : session.Email;
    }

    private void SelectWorkspace(WorkspaceId selected)
    {
        workspace = selected;
        foreach (var (id, border) in navButtons)
        {
            var isSelected = id == selected;
            border.Background = isSelected ? Theme.ActiveTabBackground : Brushes.Transparent;
            if (border.Child is Grid grid && grid.Children.Count > 1 && grid.Children[1] is TextBlock labelText)
            {
                labelText.FontWeight = isSelected ? FontWeights.Bold : FontWeights.Normal;
                labelText.Foreground = isSelected ? Theme.Foreground : Theme.SecondaryForeground;
            }
        }

        var titles = new Dictionary<WorkspaceId, (string Kicker, string Title, string Description)>
        {
            [WorkspaceId.Market] = ("PASAR HARI INI", "Kondisi Pasar Saham Indonesia", "Monitoring IHSG, breadth pasar, sektor penggerak, top movers, sentimen makro, dan daftar pantau real-time."),
            [WorkspaceId.Screener] = ("SCREENER", "Saring Kandidat Saham Terbaik", "Filter emiten berdasarkan profil risiko, rasio fundamental PER/PBV, dan sinyal teknikal objektif."),
            [WorkspaceId.Analysis] = ("ANALISIS EMITEN", ticker, "Chart interaktif candlestick, analisis fundamental terstruktur, valuasi DCF, riwayat laba, dan flow kepemilikan."),
            [WorkspaceId.Intelligence] = ("MARKET INTELLIGENCE", "Konteks & Sinyal Pasar", "News feed terverifikasi, market pulse sentiment, kalender aksi korporasi, dan breakout radar."),
            [WorkspaceId.Research] = ("RISET EMITEN", ticker, "AI Consensus Agent SahamLens, analisis bandarmology, checklist investasi, position sizing, dan dividen plan."),
            [WorkspaceId.Admin] = ("ADMIN CONSOLE", "Operasional & Health Platform", "Panel kontrol teknis, validasi TP/CL, background sync jobs, dan telemetry performa."),
            [WorkspaceId.Settings] = ("PENGATURAN", "Akun & Preferensi Aplikasi", "Manajemen sesi aman Windows (DPAPI), manajemen cache lokal, dan pemeriksaan update otomatis."),
        };

        var text = titles[selected];
        workspaceKicker.Text = text.Kicker;
        workspaceTitle.Text = text.Title;
        workspaceDescription.Text = text.Description;

        moduleBar.Children.Clear();
        foreach (var module in ProductCatalog.For(selected))
        {
            var tabButton = Theme.SecondaryButton(module.Label);
            tabButton.Margin = new Thickness(0, 0, 8, 8);
            tabButton.Click += async (_, _) => await LoadModuleAsync(module);
            moduleBar.Children.Add(tabButton);
        }

        nativeContent.Content = selected == WorkspaceId.Screener ? new ScreenerView(api) : null;
        if (selected == WorkspaceId.Settings) nativeContent.Content = new SettingsView(api, sessions);
        stateBar.IsOpen = false;
    }

    private async Task LoadModuleAsync(ProductModule module)
    {
        loading.IsActive = true;
        stateBar.IsOpen = false;
        nativeContent.Content = null;
        try
        {
            if (module.Workspace == WorkspaceId.Admin) nativeContent.Content = new AdminModuleView(api, module);
            else if (module.Id == "news") nativeContent.Content = new NewsView(api);
            else if (module.Id == "backtest") nativeContent.Content = new BacktestView(api, ticker);
            else if (module.Id == "technical")
            {
                var chartModule = ProductCatalog.Get("technical");
                var result = await api.SendAsync<ChartResult>(chartModule, ticker);
                var chart = new NativeChartControl();
                chart.SetData(ticker, result.History, false);
                nativeContent.Content = chart;
            }
            else if (module.Workspace is WorkspaceId.Analysis or WorkspaceId.Research)
                nativeContent.Content = new StructuredModuleView(api, module, ticker);
            else if (module.Workspace is WorkspaceId.Market or WorkspaceId.Intelligence)
                nativeContent.Content = new StructuredModuleView(api, module, ticker);
            else if (module.Workspace == WorkspaceId.Settings) nativeContent.Content = new SettingsView(api, sessions);
            else throw new InvalidOperationException($"Renderer native {module.Id} belum terdaftar.");

            stateBar.Severity = InfoSeverity.Success;
            stateBar.Title = module.Label;
            stateBar.Message = "Data API berhasil dimuat.";
            stateBar.IsOpen = true;
        }
        catch (AccessDeniedException error)
        {
            stateBar.Severity = InfoSeverity.Warning;
            stateBar.Title = "Akses akun diperlukan";
            stateBar.Message = error.Message;
            stateBar.IsOpen = true;
        }
        catch (Exception error)
        {
            stateBar.Severity = InfoSeverity.Error;
            stateBar.Title = $"{module.Label} gagal dimuat";
            stateBar.Message = error.Message;
            stateBar.IsOpen = true;
        }
        finally
        {
            loading.IsActive = false;
        }
    }

    private void OnTickerKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Enter) return;
        var value = tickerSearch.Text.Trim().ToUpperInvariant().Replace(".JK", string.Empty);
        if (value.Length is < 2 or > 12 || value.Any(ch => !char.IsLetterOrDigit(ch))) return;
        ticker = value;
        if (workspace is WorkspaceId.Analysis or WorkspaceId.Research) SelectWorkspace(workspace);
    }

    private async void OnAccountClick(object? sender, RoutedEventArgs e)
    {
        var dialog = new LoginWindow(api) { Owner = this };
        if (dialog.ShowDialog() == true) await RefreshSessionAsync();
    }
}
