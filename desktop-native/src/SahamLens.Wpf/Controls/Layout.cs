using System.Windows;
using System.Windows.Controls;

namespace SahamLens.Wpf.Controls;

/// <summary>
/// WPF's StackPanel has no Spacing property (unlike WinUI's) - this fills the gap via
/// margins instead of an API this port can't compile-verify locally.
/// </summary>
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
        var panel = VStack(4, new TextBlock { Text = header, Opacity = 0.7, FontSize = 12 }, control);
        if (!double.IsNaN(width)) panel.Width = width;
        return panel;
    }

    private static StackPanel Stack(Orientation orientation, double spacing, UIElement[] children)
    {
        var panel = new StackPanel { Orientation = orientation };
        foreach (var child in children) AddSpaced(panel, spacing, child);
        return panel;
    }
}
