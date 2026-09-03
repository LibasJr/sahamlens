using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace SahamLens.Wpf.Controls;

/// <summary>
/// Hardcoded brushes, deliberately not routed through Application.Current.Resources.
/// After shipping, the app rendered with a light background and unreadable text on a
/// real machine despite App.xaml defining a dark ResourceDictionary and matching
/// implicit Styles - meaning either implicit-style resolution or resource-dictionary
/// loading wasn't taking effect at runtime for a reason this session couldn't pin down
/// without a Windows machine to inspect the live visual tree. This sidesteps both
/// possible failure modes: these values are compiled directly into the assembly and
/// don't depend on any XAML resource lookup succeeding.
/// </summary>
public static class Theme
{
    public static readonly SolidColorBrush Background = Solid(0x10, 0x15, 0x15);
    public static readonly SolidColorBrush Border = Solid(0x28, 0x31, 0x31);
    public static readonly SolidColorBrush Card = Solid(0x19, 0x20, 0x20);
    public static readonly SolidColorBrush Accent = Solid(0xD5, 0xFF, 0x45);
    public static readonly SolidColorBrush Foreground = Solid(0xE5, 0xE7, 0xEB);
    public static readonly SolidColorBrush SubtleForeground = Solid(0x9C, 0xA3, 0xAF);
    public static readonly SolidColorBrush FieldBackground = Solid(0x19, 0x20, 0x20);
    public static readonly SolidColorBrush ButtonBackground = Solid(0x22, 0x2B, 0x2B);
    public static readonly SolidColorBrush ButtonHoverBackground = Solid(0x2C, 0x37, 0x37);

    private static SolidColorBrush Solid(byte r, byte g, byte b) => new(Color.FromRgb(r, g, b));

    /// <summary>
    /// Applies the dark field look directly to an input control (TextBox, PasswordBox,
    /// ComboBox), not through App.xaml's Style - see the type-level comment for why.
    /// </summary>
    public static T Field<T>(T control) where T : Control
    {
        control.Background = FieldBackground;
        control.Foreground = Foreground;
        control.BorderBrush = Border;
        control.Padding = new Thickness(8, 6, 8, 6);
        return control;
    }
}
