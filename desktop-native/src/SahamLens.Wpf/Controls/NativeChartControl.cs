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

    private readonly TextBlock symbolLabel = new()
    {
        FontSize = 20,
        FontWeight = FontWeights.Bold,
        Foreground = Theme.Foreground,
        VerticalAlignment = VerticalAlignment.Center
    };
    private readonly TextBlock ohlcLabel = new()
    {
        VerticalAlignment = VerticalAlignment.Center,
        Foreground = Theme.SecondaryForeground,
        FontFamily = Theme.MonoFont,
        FontSize = 12
    };
    private readonly StackPanel indicatorPanel = new()
    {
        Orientation = Orientation.Horizontal,
        Visibility = Visibility.Collapsed
    };
    private readonly Canvas chartCanvas = new()
    {
        MinHeight = 440,
        Background = Theme.Solid(0x0E, 0x14, 0x17)
    };
    private readonly ComboBox speed = Theme.Field(new ComboBox { SelectedIndex = 1, Width = 80 });
    private readonly ProgressBar replayProgress = new()
    {
        VerticalAlignment = VerticalAlignment.Center,
        Minimum = 0,
        Maximum = 100,
        Height = 6,
        Foreground = Theme.Accent,
        Background = Theme.Border
    };
    private readonly TextBlock progressLabel = new()
    {
        VerticalAlignment = VerticalAlignment.Center,
        Foreground = Theme.SecondaryForeground,
        FontFamily = Theme.MonoFont,
        FontSize = 11
    };

    public NativeChartControl()
    {
        BuildUi();
        timer.Tick += (_, _) => { if (visible >= candles.Count) { timer.Stop(); return; } visible++; Draw(); };
        foreach (var indicator in TechnicalIndicators.All)
        {
            var box = new CheckBox
            {
                Content = indicator.Label,
                Tag = indicator.Id,
                IsChecked = enabled.Contains(indicator.Id),
                Margin = new Thickness(0, 0, 14, 0),
                Foreground = Theme.SecondaryForeground,
                VerticalContentAlignment = VerticalAlignment.Center
            };
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
        var headerLabels = Layout.HStack(14, symbolLabel, ohlcLabel);
        var indicatorToggle = Theme.SecondaryButton("Indikator");
        indicatorToggle.Click += (_, _) => indicatorPanel.Visibility = indicatorPanel.Visibility == Visibility.Visible ? Visibility.Collapsed : Visibility.Visible;
        Grid.SetColumn(indicatorToggle, 1);
        headerRow.Children.Add(headerLabels);
        headerRow.Children.Add(indicatorToggle);

        chartCanvas.SizeChanged += (_, _) => Draw();

        var start = Theme.SecondaryButton("▶ Start");
        start.Margin = new Thickness(0, 0, 6, 0);
        start.Click += OnStart;
        var stop = Theme.SecondaryButton("⏸ Stop");
        stop.Margin = new Thickness(0, 0, 6, 0);
        stop.Click += (_, _) => timer.Stop();
        var restart = Theme.SecondaryButton("↺ Ulang");
        restart.Margin = new Thickness(0, 0, 8, 0);
        restart.Click += OnRestart;
        speed.Margin = new Thickness(0, 0, 10, 0);

        var bottomRow = new Grid();
        for (var i = 0; i < 4; i++) bottomRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        bottomRow.ColumnDefinitions.Add(new ColumnDefinition());
        bottomRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetColumn(stop, 1);
        Grid.SetColumn(restart, 2);
        Grid.SetColumn(speed, 3);
        Grid.SetColumn(replayProgress, 4);
        Grid.SetColumn(progressLabel, 5);
        replayProgress.Margin = new Thickness(8, 0, 12, 0);
        bottomRow.Children.Add(start);
        bottomRow.Children.Add(stop);
        bottomRow.Children.Add(restart);
        bottomRow.Children.Add(speed);
        bottomRow.Children.Add(replayProgress);
        bottomRow.Children.Add(progressLabel);

        var body = new Grid();
        body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        body.RowDefinitions.Add(new RowDefinition());
        body.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        headerRow.Margin = new Thickness(0, 0, 0, 12);
        indicatorPanel.Margin = new Thickness(0, 0, 0, 12);
        chartCanvas.Margin = new Thickness(0, 0, 0, 12);
        Grid.SetRow(indicatorPanel, 1);
        Grid.SetRow(chartCanvas, 2);
        Grid.SetRow(bottomRow, 3);
        body.Children.Add(headerRow);
        body.Children.Add(indicatorPanel);
        body.Children.Add(new Border
        {
            CornerRadius = new CornerRadius(8),
            ClipToBounds = true,
            BorderBrush = Theme.Border,
            BorderThickness = new Thickness(1),
            Child = chartCanvas
        });
        body.Children.Add(bottomRow);

        Content = Theme.CardContainer(body, new Thickness(16));
    }

    public void SetData(string ticker, IReadOnlyList<Candle> history, bool replay = false)
    {
        symbol = ticker;
        candles = history;
        visible = replay ? Math.Min(1, history.Count) : history.Count;
        symbolLabel.Text = ticker;
        Draw();
    }

    private void OnIndicatorChanged(object sender, RoutedEventArgs e)
    {
        if (sender is CheckBox box && box.Tag is string id)
        {
            if (box.IsChecked == true) enabled.Add(id);
            else enabled.Remove(id);
            Draw();
        }
    }

    private void OnStart(object sender, RoutedEventArgs e)
    {
        if (candles.Count > 0)
        {
            var factor = double.Parse(((ComboBoxItem)speed.SelectedItem).Tag!.ToString()!);
            timer.Interval = TimeSpan.FromMilliseconds(35 / factor);
            timer.Start();
        }
    }

    private void OnRestart(object sender, RoutedEventArgs e)
    {
        timer.Stop();
        visible = Math.Min(1, candles.Count);
        Draw();
        timer.Start();
    }

    private void Draw()
    {
        chartCanvas.Children.Clear();
        if (candles.Count == 0 || visible == 0 || chartCanvas.ActualWidth < 100) return;
        var data = candles.Take(visible).TakeLast(140).ToArray();
        var width = chartCanvas.ActualWidth;
        var height = Math.Max(chartCanvas.ActualHeight, 440);
        var priceHeight = height * .76;
        var volumeHeight = height * .18;
        var min = data.Min(x => x.Low);
        var max = data.Max(x => x.High);
        var span = Math.Max(max - min, 1);
        var maxVolume = Math.Max(data.Max(x => x.Volume), 1);
        var step = width / Math.Max(data.Length, 1);
        var bodyWidth = Math.Max(3, Math.Min(12, step * .65));

        double Y(decimal value) => 16 + (double)((max - value) / span) * (priceHeight - 32);

        // Grid lines with clean dark border colors
        for (var grid = 0; grid <= 4; grid++)
        {
            var y = 16 + grid * (priceHeight - 32) / 4;
            AddLine(0, y, width, y, Theme.Border, 0.75);
        }

        for (var i = 0; i < data.Length; i++)
        {
            var candle = data[i];
            var x = i * step + step / 2;
            var up = candle.Close >= candle.Open;
            var color = up ? Theme.Positive : Theme.Negative;

            // Wick
            AddLine(x, Y(candle.High), x, Y(candle.Low), color, 1.2);

            // Candle Body
            var top = Math.Min(Y(candle.Open), Y(candle.Close));
            var bodyHeight = Math.Max(2.0, Math.Abs(Y(candle.Open) - Y(candle.Close)));
            var body = new Rectangle
            {
                Width = bodyWidth,
                Height = bodyHeight,
                Fill = color,
                RadiusX = 1.5,
                RadiusY = 1.5
            };
            Canvas.SetLeft(body, x - bodyWidth / 2);
            Canvas.SetTop(body, top);
            chartCanvas.Children.Add(body);

            // Volume bar
            if (enabled.Contains("volume"))
            {
                var barHeight = Math.Max(1.0, candle.Volume / (double)maxVolume * volumeHeight);
                var bar = new Rectangle
                {
                    Width = bodyWidth,
                    Height = barHeight,
                    Fill = up ? Theme.Solid(80, 34, 197, 94) : Theme.Solid(80, 239, 68, 68),
                    RadiusX = 1,
                    RadiusY = 1
                };
                Canvas.SetLeft(bar, x - bodyWidth / 2);
                Canvas.SetTop(bar, height - barHeight);
                chartCanvas.Children.Add(bar);
            }
        }

        if (enabled.Contains("ema20")) DrawEma(data, 20, "#FBBF24", step, Y);
        if (enabled.Contains("ema50")) DrawEma(data, 50, "#38BDF8", step, Y);
        if (enabled.Contains("ema200")) DrawEma(data, 200, "#C084FC", step, Y);

        var last = data[^1];
        var pctChange = last.Open > 0 ? (last.Close - last.Open) / last.Open * 100m : 0m;
        var sign = pctChange >= 0 ? "+" : "";
        ohlcLabel.Text = $"{last.Time}  |  O: {last.Open:N0}  H: {last.High:N0}  L: {last.Low:N0}  C: {last.Close:N0} ({sign}{pctChange:F2}%)  Vol: {last.Volume:N0}";
        replayProgress.Value = candles.Count == 0 ? 0 : visible * 100d / candles.Count;
        progressLabel.Text = $"{visible}/{candles.Count}";
    }

    private void DrawEma(Candle[] data, int period, string color, double step, Func<decimal, double> y)
    {
        if (data.Length < 2) return;
        var points = new PointCollection();
        decimal ema = data[0].Close;
        var multiplier = 2m / (period + 1);
        for (var i = 0; i < data.Length; i++)
        {
            ema = i == 0 ? data[i].Close : (data[i].Close - ema) * multiplier + ema;
            points.Add(new Point(i * step + step / 2, y(ema)));
        }
        chartCanvas.Children.Add(new Polyline { Points = points, Stroke = Color(color), StrokeThickness = 1.5 });
    }

    private void AddLine(double x1, double y1, double x2, double y2, Brush stroke, double thickness) =>
        chartCanvas.Children.Add(new Line { X1 = x1, Y1 = y1, X2 = x2, Y2 = y2, Stroke = stroke, StrokeThickness = thickness });

    private static SolidColorBrush Color(string hex)
    {
        hex = hex.TrimStart('#');
        return new SolidColorBrush(System.Windows.Media.Color.FromArgb(255, Convert.ToByte(hex[..2], 16), Convert.ToByte(hex.Substring(2, 2), 16), Convert.ToByte(hex.Substring(4, 2), 16)));
    }
}
