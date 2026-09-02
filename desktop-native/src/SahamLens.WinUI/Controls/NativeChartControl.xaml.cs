using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using SahamLens.Domain;

namespace SahamLens.WinUI.Controls;

public sealed partial class NativeChartControl : UserControl
{
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(35) };
    private IReadOnlyList<Candle> candles = [];
    private int visible;
    private string symbol = "—";
    private readonly HashSet<string> enabled = ["ema20", "ema50", "volume"];

    public NativeChartControl()
    {
        InitializeComponent();
        timer.Tick += (_, _) => { if (visible >= candles.Count) { timer.Stop(); return; } visible++; Draw(); };
        foreach (var indicator in TechnicalIndicators.All)
        {
            var box = new CheckBox { Content = indicator.Label, Tag = indicator.Id, IsChecked = enabled.Contains(indicator.Id) };
            box.Checked += OnIndicatorChanged; box.Unchecked += OnIndicatorChanged; IndicatorPanel.Children.Add(box);
        }
    }

    public void SetData(string ticker, IReadOnlyList<Candle> history, bool replay = false)
    {
        symbol = ticker; candles = history; visible = replay ? Math.Min(1, history.Count) : history.Count; SymbolLabel.Text = ticker; Draw();
    }

    private void OnIndicatorClick(object sender, RoutedEventArgs e) => IndicatorPanel.Visibility = IndicatorPanel.Visibility == Visibility.Visible ? Visibility.Collapsed : Visibility.Visible;
    private void OnIndicatorChanged(object sender, RoutedEventArgs e) { if (sender is CheckBox box && box.Tag is string id) { if (box.IsChecked == true) enabled.Add(id); else enabled.Remove(id); Draw(); } }
    private void OnCanvasSizeChanged(object sender, SizeChangedEventArgs e) => Draw();
    private void OnStart(object sender, RoutedEventArgs e) { if (candles.Count > 0) { var factor = double.Parse(((ComboBoxItem)Speed.SelectedItem).Tag!.ToString()!); timer.Interval = TimeSpan.FromMilliseconds(35 / factor); timer.Start(); } }
    private void OnStop(object sender, RoutedEventArgs e) => timer.Stop();
    private void OnRestart(object sender, RoutedEventArgs e) { timer.Stop(); visible = Math.Min(1, candles.Count); Draw(); timer.Start(); }

    private void Draw()
    {
        ChartCanvas.Children.Clear(); if (candles.Count == 0 || visible == 0 || ChartCanvas.ActualWidth < 100) return;
        var data = candles.Take(visible).TakeLast(140).ToArray(); var width = ChartCanvas.ActualWidth; var height = Math.Max(ChartCanvas.ActualHeight, 430); var priceHeight = height * .78; var volumeHeight = height * .17;
        var min = data.Min(x => x.Low); var max = data.Max(x => x.High); var span = Math.Max(max - min, 1); var maxVolume = Math.Max(data.Max(x => x.Volume), 1); var step = width / Math.Max(data.Length, 1); var bodyWidth = Math.Max(2, Math.Min(10, step * .62));
        double Y(decimal value) => 12 + (double)((max - value) / span) * (priceHeight - 24);
        for (var grid = 0; grid <= 4; grid++) { var y = 12 + grid * (priceHeight - 24) / 4; AddLine(0, y, width, y, Color("#263030"), .7); }
        for (var i = 0; i < data.Length; i++)
        {
            var candle = data[i]; var x = i * step + step / 2; var up = candle.Close >= candle.Open; var color = Color(up ? "#22C55E" : "#EF4444");
            AddLine(x, Y(candle.High), x, Y(candle.Low), color, 1);
            var top = Math.Min(Y(candle.Open), Y(candle.Close)); var bodyHeight = Math.Max(1.5, Math.Abs(Y(candle.Open) - Y(candle.Close)));
            var body = new Rectangle { Width = bodyWidth, Height = bodyHeight, Fill = color, RadiusX = 1, RadiusY = 1 }; Canvas.SetLeft(body, x - bodyWidth / 2); Canvas.SetTop(body, top); ChartCanvas.Children.Add(body);
            if (enabled.Contains("volume")) { var bar = new Rectangle { Width = bodyWidth, Height = candle.Volume / (double)maxVolume * volumeHeight, Fill = new SolidColorBrush(up ? Windows.UI.Color.FromArgb(90, 34, 197, 94) : Windows.UI.Color.FromArgb(90, 239, 68, 68)) }; Canvas.SetLeft(bar, x - bodyWidth / 2); Canvas.SetTop(bar, height - bar.Height); ChartCanvas.Children.Add(bar); }
        }
        if (enabled.Contains("ema20")) DrawEma(data, 20, "#FBBF24", step, Y); if (enabled.Contains("ema50")) DrawEma(data, 50, "#60A5FA", step, Y); if (enabled.Contains("ema200")) DrawEma(data, 200, "#C084FC", step, Y);
        var last = data[^1]; OhlcLabel.Text = $"{last.Time}  O {last.Open:N0}  H {last.High:N0}  L {last.Low:N0}  C {last.Close:N0}  V {last.Volume:N0}"; ReplayProgress.Value = candles.Count == 0 ? 0 : visible * 100d / candles.Count; ProgressLabel.Text = $"{visible}/{candles.Count}";
    }

    private void DrawEma(Candle[] data, int period, string color, double step, Func<decimal, double> y)
    {
        if (data.Length < 2) return; var points = new PointCollection(); decimal ema = data[0].Close; var multiplier = 2m / (period + 1);
        for (var i = 0; i < data.Length; i++) { ema = i == 0 ? data[i].Close : (data[i].Close - ema) * multiplier + ema; points.Add(new Windows.Foundation.Point(i * step + step / 2, y(ema))); }
        ChartCanvas.Children.Add(new Polyline { Points = points, Stroke = Color(color), StrokeThickness = 1.4 });
    }

    private void AddLine(double x1, double y1, double x2, double y2, Brush stroke, double thickness) => ChartCanvas.Children.Add(new Line { X1 = x1, Y1 = y1, X2 = x2, Y2 = y2, Stroke = stroke, StrokeThickness = thickness });
    private static SolidColorBrush Color(string hex) { hex = hex.TrimStart('#'); return new SolidColorBrush(Windows.UI.Color.FromArgb(255, Convert.ToByte(hex[..2], 16), Convert.ToByte(hex.Substring(2, 2), 16), Convert.ToByte(hex.Substring(4, 2), 16))); }
}
