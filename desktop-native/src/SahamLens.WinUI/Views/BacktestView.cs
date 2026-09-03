using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SahamLens.Application;
using SahamLens.Domain;
using SahamLens.WinUI.Controls;

namespace SahamLens.WinUI.Views;

public sealed class BacktestView : UserControl
{
    private readonly ISahamLensApi api;
    private readonly string ticker;
    private readonly ComboBox filter = new() { Header = "Strategi", ItemsSource = BacktestFilterCatalog.Names, SelectedIndex = 0, Width = 260 };
    private readonly NumberBox capital = new() { Header = "Modal awal (Rp)", Value = 100_000_000, Minimum = 1_000_000, Width = 220 };
    private readonly ComboBox period = new() { Header = "Periode", ItemsSource = new[] { 6, 12, 24, 36, 60 }, SelectedIndex = 2, Width = 140 };
    private readonly StackPanel metrics = new() { Orientation = Orientation.Horizontal, Spacing = 12 };
    private readonly ContentControl chartHost = new();
    private readonly ProgressRing loading = new();
    private readonly InfoBar state = new() { IsOpen = false };

    public BacktestView(ISahamLensApi api, string ticker)
    {
        this.api = api; this.ticker = ticker;
        var run = new Button { Content = "Jalankan backtest", VerticalAlignment = VerticalAlignment.Bottom };
        run.Click += async (_, _) => await RunAsync();
        var controls = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, Children = { filter, capital, period, run } };
        Content = new StackPanel { Spacing = 14, Children = { new TextBlock { Text = $"Backtest {ticker}", FontSize = 24, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold }, controls, state, loading, metrics, chartHost } };
        Loaded += async (_, _) => await RunAsync();
    }

    private async Task RunAsync()
    {
        loading.IsActive = true; state.IsOpen = false; metrics.Children.Clear();
        try
        {
            var module = ProductCatalog.Get("backtest");
            using var result = await api.SendAsync(module, ticker, new { filters = new[] { filter.SelectedItem?.ToString() ?? BacktestFilterCatalog.Names[0] }, modal = capital.Value, period = (int)(period.SelectedItem ?? 24), symbol = ticker });
            foreach (var key in new[] { "return", "ihsgReturn", "alpha", "winRate", "totalTrades", "maxDD" })
                if (result.RootElement.TryGetProperty(key, out var value)) metrics.Children.Add(Card(Label(key), value.ToString()));
            var chartData = await api.SendAsync<ChartResult>(ProductCatalog.Get("technical"), ticker);
            var chart = new NativeChartControl(); chart.SetData(ticker, chartData.History, true); chartHost.Content = chart;
            state.Title = "Backtest selesai"; state.Message = "Simulasi point-in-time dan replay candle berhasil dimuat."; state.Severity = InfoBarSeverity.Success; state.IsOpen = true;
        }
        catch (Exception error) { state.Title = "Backtest gagal"; state.Message = error.Message; state.Severity = InfoBarSeverity.Error; state.IsOpen = true; }
        finally { loading.IsActive = false; }
    }

    private static Border Card(string label, string value) => new() { Padding = new Thickness(12), CornerRadius = new CornerRadius(8), Background = (Microsoft.UI.Xaml.Media.Brush)Microsoft.UI.Xaml.Application.Current.Resources["CardBrush"], Child = new StackPanel { Children = { new TextBlock { Text = label, Opacity = .65 }, new TextBlock { Text = value, FontSize = 18, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold } } } };
    private static string Label(string key) => key switch { "ihsgReturn" => "Return IHSG", "winRate" => "Win Rate", "totalTrades" => "Total Trade", "maxDD" => "Max Drawdown", _ => char.ToUpperInvariant(key[0]) + key[1..] };
}
