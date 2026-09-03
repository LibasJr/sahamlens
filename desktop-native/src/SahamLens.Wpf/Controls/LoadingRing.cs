using System.Windows;
using System.Windows.Controls;

namespace SahamLens.Wpf.Controls;

/// <summary>
/// Stand-in for WinUI's ProgressRing. Renders as a thin indeterminate bar rather than
/// a spinning ring - WPF's stock ProgressBar has no ring visual, and a custom
/// spinner template is more XAML surface than this port needs to carry.
/// </summary>
public sealed class LoadingRing : ProgressBar
{
    public LoadingRing()
    {
        IsIndeterminate = true;
        Width = 120;
        Height = 4;
        HorizontalAlignment = HorizontalAlignment.Left;
        Visibility = Visibility.Collapsed;
    }

    public bool IsActive
    {
        get => Visibility == Visibility.Visible;
        set => Visibility = value ? Visibility.Visible : Visibility.Collapsed;
    }
}
