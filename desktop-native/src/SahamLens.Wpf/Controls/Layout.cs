using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace SahamLens.Wpf.Controls;

public static class Layout
{
    public static StackPanel VStack(double spacing, params UIElement[] children) => Stack(Orientation.Vertical, spacing, children);
    public static StackPanel HStack(double spacing, params UIElement[] children) => Stack(Orientation.Horizontal, spacing, children);

    public static void AddSpaced(StackPanel panel, double spacing, UIElement child)
    {
        if (panel.Children.Count > 0 && child is FrameworkElement fe)
        {
            fe.Margin = panel.Orientation == Orientation.Horizontal
                ? new Thickness(fe.Margin.Left + spacing, fe.Margin.Top, fe.Margin.Right, fe.Margin.Bottom)
                : new Thickness(fe.Margin.Left, fe.Margin.Top + spacing, fe.Margin.Right, fe.Margin.Bottom);
        }
        panel.Children.Add(child);
    }

    public static StackPanel Labeled(string header, UIElement control, double width = double.NaN)
    {
        var label = new TextBlock
        {
            Text = header.ToUpperInvariant(),
            Foreground = Theme.SecondaryForeground,
            FontSize = 11,
            FontWeight = FontWeights.SemiBold
        };
        var panel = VStack(6, label, control);
        if (!double.IsNaN(width)) panel.Width = width;
        return panel;
    }

    public static Border PillBadge(string text, SolidColorBrush bg, SolidColorBrush fg)
    {
        return new Border
        {
            CornerRadius = new CornerRadius(999),
            Padding = new Thickness(10, 4, 10, 4),
            Background = bg,
            Child = new TextBlock
            {
                Text = text,
                Foreground = fg,
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                HorizontalAlignment = HorizontalAlignment.Center
            }
        };
    }

    private static StackPanel Stack(Orientation orientation, double spacing, UIElement[] children)
    {
        var panel = new StackPanel { Orientation = orientation };
        foreach (var child in children) AddSpaced(panel, spacing, child);
        return panel;
    }
}
