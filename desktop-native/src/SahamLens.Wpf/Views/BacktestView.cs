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
    private readonly ComboBox filter = Theme.Field(new ComboBox { Width = 260, Height = 36 });
    private readonly NumberBox capital = new() { Header = "Modal Awal (Rp)", Value = 100_000_000, Minimum = 1_000_000, Width = 220 };
    private readonly ComboBox period = Theme.Field(new ComboBox { Width = 140, Height = 36 });
    private readonly StackPanel metrics = new() { Orientation = Orientation.Horizontal };
    private readonly ContentControl chartHost = new();
    private readonly LoadingRing loading = new();
    private readonly InfoBar state = new() { IsOpen = false };

    public BacktestView(ISahamLensApi api, string ticker)
    {
        this.api = api; this.ticker = ticker;
        foreach (var name in BacktestFilterCatalog.Names) filter.Items.Add(new ComboBoxItem { Content = name });
        filter.SelectedIndex = 0;
        foreach (var months in new[] { 6, 12, 24, 36, 60 }) period.Items.Add(new ComboBoxItem { Content = $"{months} Bulan", Tag = months });
        period.SelectedIndex = 2;

        var run = Theme.PrimaryButton("Jalankan Simulasi Backtest");
        run.Height = 36;
        run.VerticalAlignment = VerticalAlignment.Bottom;
        run.Click += async (_, _) => await RunAsync();

        var controls = Layout.HStack(14, Layout.Labeled("Strategi Sinyal", filter), capital, Layout.Labeled("Periode", period), run);
        var filterCard = Theme.CardContainer(controls, new Thickness(16, 14, 16, 14));

        Content = Layout.VStack(16,
            filterCard,
            state,
            loading,
            metrics,
            chartHost);
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
                if (result.RootElement.TryGetProperty(key, out var value)) Layout.AddSpaced(metrics, 12, Card(Label(key), value.ToString(), key));
            var chartData = await api.SendAsync<ChartResult>(ProductCatalog.Get("technical"), ticker);
            var chart = new NativeChartControl(); chart.SetData(ticker, chartData.History, true); chartHost.Content = chart;
            state.Title = "Backtest selesai"; state.Message = "Simulasi point-in-time dan replay candle berhasil dimuat."; state.Severity = InfoSeverity.Success; state.IsOpen = true;
        }
        catch (Exception error) { state.Title = "Backtest gagal"; state.Message = error.Message; state.Severity = InfoSeverity.Error; state.IsOpen = true; }
        finally { loading.IsActive = false; }
    }

    private static Border Card(string label, string value, string key = "")
    {
        var isReturn = key is "return" or "ihsgReturn" or "alpha";
        var isPositive = value.StartsWith('+') || (!value.StartsWith('-') && double.TryParse(value.TrimEnd('%'), out var num) && num > 0);
        var isNegative = value.StartsWith('-');

        var valColor = isReturn
            ? (isPositive ? Theme.Positive : isNegative ? Theme.Negative : Theme.Foreground)
            : Theme.Foreground;

        return new Border
        {
            Padding = new Thickness(16, 12, 16, 12),
            CornerRadius = new CornerRadius(10),
            Background = Theme.Card,
            BorderBrush = Theme.Border,
            BorderThickness = new Thickness(1),
            MinWidth = 140,
            Child = Layout.VStack(4,
                new TextBlock { Text = label.ToUpperInvariant(), Foreground = Theme.SubtleForeground, FontSize = 11, FontWeight = FontWeights.SemiBold },
                new TextBlock { Text = value, FontSize = 20, FontWeight = FontWeights.Bold, Foreground = valColor, FontFamily = Theme.MonoFont })
        };
    }
    private static string Label(string key) => key switch { "ihsgReturn" => "Return IHSG", "winRate" => "Win Rate", "totalTrades" => "Total Trade", "maxDD" => "Max Drawdown", _ => char.ToUpperInvariant(key[0]) + key[1..] };
}
