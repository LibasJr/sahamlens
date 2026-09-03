using System.Windows;
using System.Windows.Controls;
using SahamLens.Application;
using SahamLens.Domain;
using SahamLens.Wpf.Controls;

namespace SahamLens.Wpf.Views;

public sealed class ScreenerView : UserControl
{
    private readonly ISahamLensApi api;
    private readonly ComboBox profile = new() { Width = 220 };
    private readonly ComboBox sector = new() { Width = 220 };
    private readonly TextBlock summary = new() { VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(0, 0, 0, 10), Opacity = 0.7 };
    private readonly InfoBar guestWarning = new() { Severity = InfoSeverity.Warning, IsClosable = false, IsOpen = false, Title = "Sesi guest terdeteksi", Message = "Masuk dengan akun Anda untuk membuka hasil penuh." };
    private readonly LoadingRing loadingRing = new();
    private readonly StackPanel results = new();

    public ScreenerView(ISahamLensApi api)
    {
        this.api = api;
        foreach (var name in new[] { "Konservatif", "Moderat", "Agresif" }) profile.Items.Add(new ComboBoxItem { Content = name });
        profile.SelectedIndex = 1;
        sector.Items.Add(new ComboBoxItem { Content = "Semua sektor" });
        sector.SelectedIndex = 0;

        var refresh = new Button { Content = "Refresh", VerticalAlignment = VerticalAlignment.Bottom };
        refresh.Click += async (_, _) => await LoadAsync();
        var filterRow = Layout.HStack(10, Layout.Labeled("Profil risiko", profile), Layout.Labeled("Sektor", sector), summary, refresh);

        Content = Layout.VStack(12, filterRow, guestWarning, loadingRing, Header(), results);
        Loaded += async (_, _) => await LoadAsync();
    }

    private static Grid Header()
    {
        var grid = new Grid { Margin = new Thickness(12, 8, 12, 8) };
        AddColumns(grid);
        var labels = new[] { "Ticker", "Nama", "Sektor", "Sinyal", "Harga", "PER", "PBV" };
        for (var i = 0; i < labels.Length; i++)
        {
            var text = new TextBlock { Text = labels[i], Opacity = 0.6, FontWeight = System.Windows.FontWeights.SemiBold };
            Grid.SetColumn(text, i);
            grid.Children.Add(text);
        }
        return grid;
    }

    private static void AddColumns(Grid grid)
    {
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(100) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(2, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1.5, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(120) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(100) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(100) });
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(100) });
    }

    private static UIElement Row(ScreenerStock stock)
    {
        var grid = new Grid { Margin = new Thickness(12, 9, 12, 9) };
        AddColumns(grid);
        var values = new[] { stock.Ticker, stock.Name, stock.Sector ?? "—", stock.Signal ?? "—", stock.Entry?.ToString() ?? "—", stock.Per?.ToString() ?? "—", stock.Pbv?.ToString() ?? "—" };
        for (var i = 0; i < values.Length; i++)
        {
            var text = new TextBlock { Text = values[i], TextWrapping = TextWrapping.NoWrap };
            if (i == 0) text.FontWeight = System.Windows.FontWeights.SemiBold;
            Grid.SetColumn(text, i);
            grid.Children.Add(text);
        }
        return new Border { BorderBrush = (System.Windows.Media.Brush)Application.Current.Resources["AppBorderBrush"], BorderThickness = new Thickness(0, 0, 0, 1), Child = grid };
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
            summary.Text = $"{result.Analysis.Stocks.Count} dari {result.Analysis.TotalCount} hasil · {result.Profile}";
            guestWarning.IsOpen = result.Analysis.IsGuestLimited;
            if (result.Analysis.IsGuestLimited) summary.Text += $" · {result.Analysis.LockedCount} dikunci";
            sector.Items.Clear(); sector.Items.Add(new ComboBoxItem { Content = "Semua sektor" });
            foreach (var sectorName in result.AvailableSectors) sector.Items.Add(new ComboBoxItem { Content = sectorName });
            sector.SelectedIndex = 0;
        }
        catch (Exception error) { guestWarning.Severity = InfoSeverity.Error; guestWarning.Title = "Screener gagal dimuat"; guestWarning.Message = error.Message; guestWarning.IsOpen = true; }
        finally { loadingRing.IsActive = false; }
    }
}
