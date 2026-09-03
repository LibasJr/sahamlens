using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using SahamLens.Application;
using SahamLens.Domain;
using SahamLens.Wpf.Controls;

namespace SahamLens.Wpf.Views;

public sealed class BacktestView : UserControl
{
    private readonly ISahamLensApi api;
    private readonly string ticker;
    private readonly ComboBox filter = new() { Width = 260 };
    private readonly NumberBox capital = new() { Header = "Modal awal (Rp)", Value = 100_000_000, Minimum = 1_000_000, Width = 220 };
    private readonly ComboBox period = new() { Width = 140 };
    private readonly StackPanel metrics = new() { Orientation = Orientation.Horizontal };
    private readonly ContentControl chartHost = new();
    private readonly LoadingRing loading = new();
    private readonly InfoBar state = new() { IsOpen = false };

    public BacktestView(ISahamLensApi api, string ticker)
    {
        this.api = api; this.ticker = ticker;
        foreach (var name in BacktestFilterCatalog.Names) filter.Items.Add(new ComboBoxItem { Content = name });
        filter.SelectedIndex = 0;
        foreach (var months in new[] { 6, 12, 24, 36, 60 }) period.Items.Add(new ComboBoxItem { Content = months, Tag = months });
        period.SelectedIndex = 2;

        var run = new Button { Content = "Jalankan backtest", VerticalAlignment = VerticalAlignment.Bottom };
        run.Click += async (_, _) => await RunAsync();
        var controls = Layout.HStack(12, Layout.Labeled("Strategi", filter), capital, Layout.Labeled("Periode", period), run);
        Content = Layout.VStack(14,
            new TextBlock { Text = $"Backtest {ticker}", FontSize = 24, FontWeight = FontWeights.SemiBold },
            controls, state, loading, metrics, chartHost);
        Loaded += async (_, _) => await RunAsync();
    }

    private async Task RunAsync()
    {
        loading.IsActive = true; state.IsOpen = false; metrics.Children.Clear();
        try
        {
            var module = ProductCatalog.Get("backtest");
            var selectedFilter = (filter.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? BacktestFilterCatalog.Names[0];
            var selectedPeriod = (int)((period.SelectedItem as ComboBoxItem)?.Tag ?? 24);
            using var result = await api.SendAsync(module, ticker, new { filters = new[] { selectedFilter }, modal = capital.Value, period = selectedPeriod, symbol = ticker });
            foreach (var key in new[] { "return", "ihsgReturn", "alpha", "winRate", "totalTrades", "maxDD" })
                if (result.RootElement.TryGetProperty(key, out var value)) Layout.AddSpaced(metrics, 12, Card(Label(key), value.ToString()));
            var chartData = await api.SendAsync<ChartResult>(ProductCatalog.Get("technical"), ticker);
            var chart = new NativeChartControl(); chart.SetData(ticker, chartData.History, true); chartHost.Content = chart;
            state.Title = "Backtest selesai"; state.Message = "Simulasi point-in-time dan replay candle berhasil dimuat."; state.Severity = InfoSeverity.Success; state.IsOpen = true;
        }
        catch (Exception error) { state.Title = "Backtest gagal"; state.Message = error.Message; state.Severity = InfoSeverity.Error; state.IsOpen = true; }
        finally { loading.IsActive = false; }
    }

    private static Border Card(string label, string value) => new()
    {
        Padding = new Thickness(12),
        CornerRadius = new CornerRadius(8),
        Background = (Brush)System.Windows.Application.Current.Resources["CardBrush"],
        Child = Layout.VStack(2,
            new TextBlock { Text = label, Opacity = .65 },
            new TextBlock { Text = value, FontSize = 18, FontWeight = FontWeights.SemiBold })
    };
    private static string Label(string key) => key switch { "ihsgReturn" => "Return IHSG", "winRate" => "Win Rate", "totalTrades" => "Total Trade", "maxDD" => "Max Drawdown", _ => char.ToUpperInvariant(key[0]) + key[1..] };
}
