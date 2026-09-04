using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using SahamLens.Application;
using SahamLens.Domain;
using SahamLens.Wpf.Controls;

namespace SahamLens.Wpf.Views;

public sealed class ScreenerView : UserControl
{
    private readonly ISahamLensApi api;
    private readonly ComboBox profile = Theme.Field(new ComboBox { Width = 180, Height = 36 });
    private readonly ComboBox sector = Theme.Field(new ComboBox { Width = 220, Height = 36 });
    private readonly TextBlock summary = new()
    {
        VerticalAlignment = VerticalAlignment.Center,
        Foreground = Theme.SecondaryForeground,
        FontSize = 12
    };
    private readonly InfoBar guestWarning = new()
    {
        Severity = InfoSeverity.Warning,
        IsClosable = false,
        IsOpen = false,
        Title = "Sesi guest terdeteksi",
        Message = "Masuk dengan akun Anda untuk membuka hasil penuh dan indikator mendalam."
    };
    private readonly LoadingRing loadingRing = new();
    private readonly StackPanel results = new();

    public ScreenerView(ISahamLensApi api)
    {
        this.api = api;
        foreach (var name in new[] { "Konservatif", "Moderat", "Agresif" }) profile.Items.Add(new ComboBoxItem { Content = name });
        profile.SelectedIndex = 1;
        sector.Items.Add(new ComboBoxItem { Content = "Semua sektor" });
        sector.SelectedIndex = 0;

        var refresh = Theme.PrimaryButton("Terapkan Filter");
        refresh.Height = 36;
        refresh.VerticalAlignment = VerticalAlignment.Bottom;
        refresh.Click += async (_, _) => await LoadAsync();

        var filterRow = Layout.HStack(14,
            Layout.Labeled("Profil Risiko", profile),
            Layout.Labeled("Sektor Saham", sector),
            refresh,
            summary);

        var filterCard = Theme.CardContainer(filterRow, new Thickness(16, 14, 16, 14));

        var tableCard = Theme.CardContainer(
            Layout.VStack(8, Header(), results),
            new Thickness(12, 10, 12, 10));

        Content = Layout.VStack(14, filterCard, guestWarning, loadingRing, tableCard);
        Loaded += async (_, _) => await LoadAsync();
    }

    private static Grid Header()
    {
        var grid = new Grid { Margin = new Thickness(12, 10, 12, 10) };
        AddColumns(grid);
        var labels = new[] { "Ticker", "Nama Emiten", "Sektor", "Sinyal", "Harga Entri", "PER", "PBV" };
        for (var i = 0; i < labels.Length; i++)
        {
            var text = new TextBlock
            {
                Text = labels[i].ToUpperInvariant(),
                Foreground = Theme.SubtleForeground,
                FontWeight = FontWeights.Bold,
                FontSize = 11
            };
            if (i >= 4) text.HorizontalAlignment = HorizontalAlignment.Right;
            Grid.SetColumn(text, i);
            grid.Children.Add(text);
        }
        return grid;
    }

    private static void AddColumns(Grid grid)
    {
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(90) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.4, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(110) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(100) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(80) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(80) });
    }

    private static UIElement Row(ScreenerStock stock)
    {
        var grid = new Grid { Margin = new Thickness(12, 10, 12, 10) };
        AddColumns(grid);

        var tickerText = new TextBlock
        {
            Text = stock.Ticker,
            FontWeight = FontWeights.Bold,
            Foreground = Theme.Accent,
            FontSize = 13,
            VerticalAlignment = VerticalAlignment.Center
        };
        Grid.SetColumn(tickerText, 0);
        grid.Children.Add(tickerText);

        var nameText = new TextBlock
        {
            Text = stock.Name,
            TextWrapping = TextWrapping.NoWrap,
            TextTrimming = TextTrimming.CharacterEllipsis,
            Foreground = Theme.Foreground,
            FontSize = 13,
            VerticalAlignment = VerticalAlignment.Center
        };
        Grid.SetColumn(nameText, 1);
        grid.Children.Add(nameText);

        var sectorText = new TextBlock
        {
            Text = stock.Sector ?? "—",
            Foreground = Theme.SecondaryForeground,
            FontSize = 12,
            VerticalAlignment = VerticalAlignment.Center
        };
        Grid.SetColumn(sectorText, 2);
        grid.Children.Add(sectorText);

        var signalText = stock.Signal ?? "—";
        var isBullish = signalText.Contains("BUY", StringComparison.OrdinalIgnoreCase) || signalText.Contains("BULL", StringComparison.OrdinalIgnoreCase);
        var isBearish = signalText.Contains("SELL", StringComparison.OrdinalIgnoreCase) || signalText.Contains("BEAR", StringComparison.OrdinalIgnoreCase);
        var signalBadge = Layout.PillBadge(
            signalText,
            isBullish ? Theme.PositiveMuted : isBearish ? Theme.NegativeMuted : Theme.Solid(0x1F, 0x29, 0x37),
            isBullish ? Theme.Positive : isBearish ? Theme.Negative : Theme.SecondaryForeground
        );
        signalBadge.HorizontalAlignment = HorizontalAlignment.Left;
        signalBadge.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(signalBadge, 3);
        grid.Children.Add(signalBadge);

        var priceText = new TextBlock
        {
            Text = stock.Entry.HasValue ? $"Rp {stock.Entry.Value:N0}" : "—",
            FontFamily = Theme.MonoFont,
            FontSize = 12,
            Foreground = Theme.Foreground,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Center
        };
        Grid.SetColumn(priceText, 4);
        grid.Children.Add(priceText);

        var perText = new TextBlock
        {
            Text = stock.Per.HasValue ? $"{stock.Per.Value:F1}x" : "—",
            FontFamily = Theme.MonoFont,
            FontSize = 12,
            Foreground = Theme.SecondaryForeground,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Center
        };
        Grid.SetColumn(perText, 5);
        grid.Children.Add(perText);

        var pbvText = new TextBlock
        {
            Text = stock.Pbv.HasValue ? $"{stock.Pbv.Value:F2}x" : "—",
            FontFamily = Theme.MonoFont,
            FontSize = 12,
            Foreground = Theme.SecondaryForeground,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Center
        };
        Grid.SetColumn(pbvText, 6);
        grid.Children.Add(pbvText);

        var rowBorder = new Border
        {
            BorderBrush = Theme.Border,
            BorderThickness = new Thickness(0, 0, 0, 1),
            Background = Brushes.Transparent,
            Child = grid
        };
        rowBorder.MouseEnter += (_, _) => rowBorder.Background = Theme.CardHover;
        rowBorder.MouseLeave += (_, _) => rowBorder.Background = Brushes.Transparent;
        return rowBorder;
    }

    private async Task LoadAsync()
    {
        loadingRing.IsActive = true;
        try
        {
            var profileName = ((ComboBoxItem)profile.SelectedItem).Content.ToString()!;
            var module = ProductCatalog.Get("screener") with { Endpoint = $"/api/screener?profile={Uri.EscapeDataString(profileName)}" };
            var result = await api.SendAsync<ScreenerResult>(module);
            results.Children.Clear();
            foreach (var stock in result.Analysis.Stocks) results.Children.Add(Row(stock));
            summary.Text = $"{result.Analysis.Stocks.Count} dari {result.Analysis.TotalCount} hasil · Profil: {result.Profile}";
            guestWarning.IsOpen = result.Analysis.IsGuestLimited;
            if (result.Analysis.IsGuestLimited) summary.Text += $" · {result.Analysis.LockedCount} emiten terkunci";
            sector.Items.Clear();
            sector.Items.Add(new ComboBoxItem { Content = "Semua sektor" });
            foreach (var sectorName in result.AvailableSectors) sector.Items.Add(new ComboBoxItem { Content = sectorName });
            sector.SelectedIndex = 0;
        }
        catch (Exception error)
        {
            guestWarning.Severity = InfoSeverity.Error;
            guestWarning.Title = "Screener gagal dimuat";
            guestWarning.Message = error.Message;
            guestWarning.IsOpen = true;
        }
        finally
        {
            loadingRing.IsActive = false;
        }
    }
}
