using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using SahamLens.Domain;

namespace SahamLens.Wpf.Controls;

public sealed class NativeChartControl : UserControl
{
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(35) };
    private IReadOnlyList<Candle> candles = [];
    private int visible;
    private string symbol = "—";
    private readonly HashSet<string> enabled = ["ema20", "ema50", "volume"];

    private readonly TextBlock symbolLabel = new() { FontSize = 20, FontWeight = FontWeights.SemiBold };
    private readonly TextBlock ohlcLabel = new() { VerticalAlignment = VerticalAlignment.Center, Opacity = 0.75 };
    private readonly StackPanel indicatorPanel = new() { Orientation = Orientation.Horizontal, Visibility = Visibility.Collapsed };
    private readonly Canvas chartCanvas = new() { MinHeight = 430 };
    private readonly ComboBox speed = new() { SelectedIndex = 1, Width = 80 };
    private readonly ProgressBar replayProgress = new() { VerticalAlignment = VerticalAlignment.Center, Minimum = 0, Maximum = 100 };
    private readonly TextBlock progressLabel = new() { VerticalAlignment = VerticalAlignment.Center, Opacity = 0.7 };

    public NativeChartControl()
    {
        BuildUi();
        timer.Tick += (_, _) => { if (visible >= candles.Count) { timer.Stop(); return; } visible++; Draw(); };
        foreach (var indicator in TechnicalIndicators.All)
        {
            var box = new CheckBox { Content = indicator.Label, Tag = indicator.Id, IsChecked = enabled.Contains(indicator.Id), Margin = new Thickness(0, 0, 8, 0) };
            box.Checked += OnIndicatorChanged;
            box.Unchecked += OnIndicatorChanged;
            indicatorPanel.Children.Add(box);
        }
    }

    private void BuildUi()
    {
        speed.Items.Add(new ComboBoxItem { Content = "0.5×", Tag = "0.5" });
        speed.Items.Add(new ComboBoxItem { Content = "1×", Tag = "1" });
        speed.Items.Add(new ComboBoxItem { Content = "2×", Tag = "2" });

        var headerRow = new Grid();
        headerRow.ColumnDefinitions.Add(new ColumnDefinition());
        headerRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var headerLabels = Layout.HStack(12, symbolLabel, ohlcLabel);
        var indicatorToggle = new Button { Content = "Indikator" };
        indicatorToggle.Click += (_, _) => indicatorPanel.Visibility = indicatorPanel.Visibility == Visibility.Visible ? Visibility.Collapsed : Visibility.Visible;
        Grid.SetColumn(indicatorToggle, 1);
        headerRow.Children.Add(headerLabels);
        headerRow.Children.Add(indicatorToggle);

        chartCanvas.SizeChanged += (_, _) => Draw();

        var start = new Button { Content = "Start", Margin = new Thickness(0, 0, 8, 0) };
        start.Click += OnStart;
        var stop = new Button { Content = "Stop", Margin = new Thickness(0, 0, 8, 0) };
        stop.Click += (_, _) => timer.Stop();
        var restart = new Button { Content = "Ulang", Margin = new Thickness(0, 0, 8, 0) };
        restart.Click += OnRestart;
        speed.Margin = new Thickness(0, 0, 8, 0);

        var bottomRow = new Grid();
        for (var i = 0; i < 4; i++) bottomRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        bottomRow.ColumnDefinitions.Add(new ColumnDefinition());
        bottomRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(stop, 1); Grid.SetColumn(restart, 2); Grid.SetColumn(speed, 3);
        Grid.SetColumn(replayProgress, 4); Grid.SetColumn(progressLabel, 5);
        bottomRow.Children.Add(start); bottomRow.Children.Add(stop); bottomRow.Children.Add(restart);
        bottomRow.Children.Add(speed); bottomRow.Children.Add(replayProgress); bottomRow.Children.Add(progressLabel);

        var body = new Grid();
        body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        body.RowDefinitions.Add(new RowDefinition());
        body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        headerRow.Margin = new Thickness(0, 0, 0, 10);
        indicatorPanel.Margin = new Thickness(0, 0, 0, 10);
        chartCanvas.Margin = new Thickness(0, 0, 0, 10);
        Grid.SetRow(indicatorPanel, 1); Grid.SetRow(chartCanvas, 2); Grid.SetRow(bottomRow, 3);
        body.Children.Add(headerRow); body.Children.Add(indicatorPanel); body.Children.Add(chartCanvas); body.Children.Add(bottomRow);

        Content = new Border { Background = Theme.Card, CornerRadius = new CornerRadius(12), Padding = new Thickness(14), Child = body };
    }

    public void SetData(string ticker, IReadOnlyList<Candle> history, bool replay = false)
    {
        symbol = ticker; candles = history; visible = replay ? Math.Min(1, history.Count) : history.Count; symbolLabel.Text = ticker; Draw();
    }

    private void OnIndicatorChanged(object sender, RoutedEventArgs e) { if (sender is CheckBox box && box.Tag is string id) { if (box.IsChecked == true) enabled.Add(id); else enabled.Remove(id); Draw(); } }
    private void OnStart(object sender, RoutedEventArgs e) { if (candles.Count > 0) { var factor = double.Parse(((ComboBoxItem)speed.SelectedItem).Tag!.ToString()!); timer.Interval = TimeSpan.FromMilliseconds(35 / factor); timer.Start(); } }
    private void OnRestart(object sender, RoutedEventArgs e) { timer.Stop(); visible = Math.Min(1, candles.Count); Draw(); timer.Start(); }

    private void Draw()
    {
        chartCanvas.Children.Clear(); if (candles.Count == 0 || visible == 0 || chartCanvas.ActualWidth < 100) return;
        var data = candles.Take(visible).TakeLast(140).ToArray(); var width = chartCanvas.ActualWidth; var height = Math.Max(chartCanvas.ActualHeight, 430); var priceHeight = height * .78; var volumeHeight = height * .17;
        var min = data.Min(x => x.Low); var max = data.Max(x => x.High); var span = Math.Max(max - min, 1); var maxVolume = Math.Max(data.Max(x => x.Volume), 1); var step = width / Math.Max(data.Length, 1); var bodyWidth = Math.Max(2, Math.Min(10, step * .62));
        double Y(decimal value) => 12 + (double)((max - value) / span) * (priceHeight - 24);
        for (var grid = 0; grid <= 4; grid++) { var y = 12 + grid * (priceHeight - 24) / 4; AddLine(0, y, width, y, Color("#263030"), .7); }
        for (var i = 0; i < data.Length; i++)
        {
            var candle = data[i]; var x = i * step + step / 2; var up = candle.Close >= candle.Open; var color = Color(up ? "#22C55E" : "#EF4444");
            AddLine(x, Y(candle.High), x, Y(candle.Low), color, 1);
            var top = Math.Min(Y(candle.Open), Y(candle.Close)); var bodyHeight = Math.Max(1.5, Math.Abs(Y(candle.Open) - Y(candle.Close)));
            var body = new Rectangle { Width = bodyWidth, Height = bodyHeight, Fill = color, RadiusX = 1, RadiusY = 1 }; Canvas.SetLeft(body, x - bodyWidth / 2); Canvas.SetTop(body, top); chartCanvas.Children.Add(body);
            if (enabled.Contains("volume")) { var bar = new Rectangle { Width = bodyWidth, Height = candle.Volume / (double)maxVolume * volumeHeight, Fill = new SolidColorBrush(up ? System.Windows.Media.Color.FromArgb(90, 34, 197, 94) : System.Windows.Media.Color.FromArgb(90, 239, 68, 68)) }; Canvas.SetLeft(bar, x - bodyWidth / 2); Canvas.SetTop(bar, height - bar.Height); chartCanvas.Children.Add(bar); }
        }
        if (enabled.Contains("ema20")) DrawEma(data, 20, "#FBBF24", step, Y); if (enabled.Contains("ema50")) DrawEma(data, 50, "#60A5FA", step, Y); if (enabled.Contains("ema200")) DrawEma(data, 200, "#C084FC", step, Y);
        var last = data[^1]; ohlcLabel.Text = $"{last.Time}  O {last.Open:N0}  H {last.High:N0}  L {last.Low:N0}  C {last.Close:N0}  V {last.Volume:N0}"; replayProgress.Value = candles.Count == 0 ? 0 : visible * 100d / candles.Count; progressLabel.Text = $"{visible}/{candles.Count}";
    }

    private void DrawEma(Candle[] data, int period, string color, double step, Func<decimal, double> y)
    {
        if (data.Length < 2) return; var points = new PointCollection(); decimal ema = data[0].Close; var multiplier = 2m / (period + 1);
        for (var i = 0; i < data.Length; i++) { ema = i == 0 ? data[i].Close : (data[i].Close - ema) * multiplier + ema; points.Add(new Point(i * step + step / 2, y(ema))); }
        chartCanvas.Children.Add(new Polyline { Points = points, Stroke = Color(color), StrokeThickness = 1.4 });
    }

    private void AddLine(double x1, double y1, double x2, double y2, Brush stroke, double thickness) => chartCanvas.Children.Add(new Line { X1 = x1, Y1 = y1, X2 = x2, Y2 = y2, Stroke = stroke, StrokeThickness = thickness });
    private static SolidColorBrush Color(string hex) { hex = hex.TrimStart('#'); return new SolidColorBrush(System.Windows.Media.Color.FromArgb(255, Convert.ToByte(hex[..2], 16), Convert.ToByte(hex.Substring(2, 2), 16), Convert.ToByte(hex.Substring(4, 2), 16))); }
}
