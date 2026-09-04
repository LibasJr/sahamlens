using System.Windows;
using System.Windows.Controls;

namespace SahamLens.Wpf.Controls;

/// <summary>
/// Stand-in for WinUI's ProgressRing. Renders as a sleek, accent-colored indeterminate
/// progress bar with pill styling.
/// </summary>
public sealed class LoadingRing : ProgressBar
{
    public LoadingRing()
    {
        IsIndeterminate = true;
        Width = 140;
        Height = 4;
        HorizontalAlignment = HorizontalAlignment.Left;
        Visibility = Visibility.Collapsed;
        Foreground = Theme.Accent;
        Background = Theme.Border;
        Margin = new Thickness(0, 4, 0, 4);
    }

    public bool IsActive
    {
        get => Visibility == Visibility.Visible;
        set => Visibility = value ? Visibility.Visible : Visibility.Collapsed;
    }
}
