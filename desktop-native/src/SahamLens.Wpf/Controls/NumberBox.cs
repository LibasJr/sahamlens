using System.Globalization;
using System.Windows;
using System.Windows.Controls;

namespace SahamLens.Wpf.Controls;

/// <summary>Stand-in for WinUI's NumberBox - a labeled numeric text field, no spin buttons.</summary>
public sealed class NumberBox : UserControl
{
    private readonly TextBlock headerText = new() { Opacity = 0.7, FontSize = 12 };
    private readonly TextBox input = new();
    private double minimum;

    public NumberBox()
    {
        input.Text = "0";
        input.Background = Theme.FieldBackground;
        input.Foreground = Theme.Foreground;
        input.BorderBrush = Theme.Border;
        input.Padding = new Thickness(8, 6, 8, 6);
        input.LostFocus += (_, _) => Value = ParsedValue();
        Content = Layout.VStack(4, headerText, input);
    }

    public string Header { get => headerText.Text; set => headerText.Text = value; }
    public double Minimum { get => minimum; set { minimum = value; if (Value < minimum) Value = minimum; } }

    public double Value
    {
        get => ParsedValue();
        set => input.Text = value.ToString("0.##", CultureInfo.InvariantCulture);
    }

    private double ParsedValue()
    {
        if (!double.TryParse(input.Text, NumberStyles.Number, CultureInfo.InvariantCulture, out var value)) value = minimum;
        if (value < minimum) value = minimum;
        return value;
    }
}
