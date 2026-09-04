using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace SahamLens.Wpf.Controls;

/// <summary>
/// Hardcoded theme tokens and factory methods compiled directly into the assembly,
/// guaranteeing consistent rendering regardless of XAML resource resolution quirks.
/// Designed with a modern, high-contrast dark financial terminal aesthetic.
/// </summary>
public static class Theme
{
    // Backgrounds
    public static readonly SolidColorBrush Background = Solid(0x0C, 0x10, 0x12);         // Rich dark backdrop
    public static readonly SolidColorBrush SidebarBackground = Solid(0x08, 0x0C, 0x0E);  // Deeper sidebar
    public static readonly SolidColorBrush Card = Solid(0x13, 0x1A, 0x1D);               // Card surface
    public static readonly SolidColorBrush CardHover = Solid(0x1A, 0x23, 0x27);          // Card hover
    public static readonly SolidColorBrush HeaderBackground = Solid(0x10, 0x16, 0x19);   // Top header

    // Borders
    public static readonly SolidColorBrush Border = Solid(0x23, 0x2F, 0x34);             // Subtle border
    public static readonly SolidColorBrush BorderStrong = Solid(0x35, 0x46, 0x4E);       // Pronounced border

    // Accents & Financial Colors
    public static readonly SolidColorBrush Accent = Solid(0xD5, 0xFF, 0x45);             // SahamLens Lime Accent (#D5FF45)
    public static readonly SolidColorBrush AccentMuted = Solid(0x2B, 0x38, 0x16);        // Dim lime badge bg
    public static readonly SolidColorBrush AccentForeground = Solid(0x0C, 0x10, 0x12);   // Dark text on lime
    public static readonly SolidColorBrush Positive = Solid(0x22, 0xC5, 0x5E);           // Stock Green (+ profit)
    public static readonly SolidColorBrush PositiveMuted = Solid(0x12, 0x2B, 0x1D);      // Green badge bg
    public static readonly SolidColorBrush Negative = Solid(0xEF, 0x44, 0x44);           // Stock Red (- loss)
    public static readonly SolidColorBrush NegativeMuted = Solid(0x34, 0x16, 0x18);      // Red badge bg
    public static readonly SolidColorBrush Warning = Solid(0xF5, 0x9E, 0x0B);            // Amber warning
    public static readonly SolidColorBrush Info = Solid(0x38, 0xBD, 0xF8);               // Sky blue

    // Typography
    public static readonly SolidColorBrush Foreground = Solid(0xF3, 0xF4, 0xF6);         // Bright crisp primary text
    public static readonly SolidColorBrush SecondaryForeground = Solid(0x94, 0xA3, 0xB8);// Muted secondary text
    public static readonly SolidColorBrush SubtleForeground = Solid(0x64, 0x74, 0x8B);   // Dim tertiary text / captions

    // Interactive Fields & Buttons
    public static readonly SolidColorBrush FieldBackground = Solid(0x14, 0x1C, 0x20);    // Inputs
    public static readonly SolidColorBrush FieldFocusBorder = Solid(0xD5, 0xFF, 0x45);   // Focused input
    public static readonly SolidColorBrush ButtonBackground = Solid(0x1E, 0x28, 0x2D);   // Neutral button
    public static readonly SolidColorBrush ButtonHoverBackground = Solid(0x28, 0x36, 0x3C);// Hover
    public static readonly SolidColorBrush ActiveTabBackground = Solid(0x24, 0x33, 0x3A); // Tab active pill

    public static readonly FontFamily PrimaryFont = new("Segoe UI, Inter, Arial");
    public static readonly FontFamily MonoFont = new("Consolas, JetBrains Mono, monospace");

    public static SolidColorBrush Solid(byte r, byte g, byte b) => new(Color.FromRgb(r, g, b));
    public static SolidColorBrush Solid(byte a, byte r, byte g, byte b) => new(Color.FromArgb(a, r, g, b));

    public static T Field<T>(T control) where T : Control
    {
        control.Background = FieldBackground;
        control.Foreground = Foreground;
        control.BorderBrush = Border;
        control.BorderThickness = new Thickness(1);
        control.Padding = new Thickness(10, 7, 10, 7);
        control.FontSize = 13;
        return control;
    }

    public static Button PrimaryButton(string text)
    {
        return new Button
        {
            Content = text,
            Background = Accent,
            Foreground = AccentForeground,
            BorderThickness = new Thickness(0),
            Padding = new Thickness(16, 8, 16, 8),
            FontWeight = FontWeights.SemiBold,
            FontSize = 13,
            Cursor = System.Windows.Input.Cursors.Hand
        };
    }

    public static Button SecondaryButton(string text)
    {
        return new Button
        {
            Content = text,
            Background = ButtonBackground,
            Foreground = Foreground,
            BorderBrush = Border,
            BorderThickness = new Thickness(1),
            Padding = new Thickness(14, 7, 14, 7),
            FontWeight = FontWeights.Normal,
            FontSize = 13,
            Cursor = System.Windows.Input.Cursors.Hand
        };
    }

    public static Border CardContainer(UIElement child, Thickness? padding = null)
    {
        return new Border
        {
            Background = Card,
            BorderBrush = Border,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(10),
            Padding = padding ?? new Thickness(16),
            Child = child
        };
    }
}
