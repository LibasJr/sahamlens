using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace SahamLens.Wpf.Controls;

public enum InfoSeverity { Informational, Success, Warning, Error }

/// <summary>Polished stand-in for WinUI's InfoBar with subtle tinted background and modern border.</summary>
public sealed class InfoBar : UserControl
{
    private readonly Border accent = new() { Width = 4, HorizontalAlignment = HorizontalAlignment.Left, CornerRadius = new CornerRadius(2) };
    private readonly TextBlock titleText = new() { FontWeight = FontWeights.SemiBold, FontSize = 13 };
    private readonly TextBlock messageText = new() { TextWrapping = TextWrapping.Wrap, Foreground = Theme.SecondaryForeground, FontSize = 12 };
    private readonly Button closeButton = new()
    {
        Content = "✕",
        Padding = new Thickness(6, 2, 6, 2),
        HorizontalAlignment = HorizontalAlignment.Right,
        VerticalAlignment = VerticalAlignment.Top,
        Background = Brushes.Transparent,
        BorderThickness = new Thickness(0),
        Foreground = Theme.SecondaryForeground
    };
    private readonly Border container;

    private bool isOpen;
    private bool isClosable;
    private InfoSeverity severity = InfoSeverity.Informational;

    public InfoBar()
    {
        closeButton.Click += (_, _) => IsOpen = false;
        var grid = new Grid();
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.ColumnDefinitions.Add(new ColumnDefinition());
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var text = Layout.VStack(3, titleText, messageText);
        text.Margin = new Thickness(12, 10, 12, 10);
        Grid.SetColumn(text, 1);
        Grid.SetColumn(closeButton, 2);
        grid.Children.Add(accent);
        grid.Children.Add(text);
        grid.Children.Add(closeButton);
        container = new Border
        {
            Background = Theme.Card,
            BorderBrush = Theme.Border,
            BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8),
            Child = grid
        };
        Content = container;
        Update();
    }

    public string Title { get => titleText.Text; set { titleText.Text = value; } }
    public string Message { get => messageText.Text; set { messageText.Text = value; } }
    public InfoSeverity Severity { get => severity; set { severity = value; Update(); } }
    public bool IsOpen { get => isOpen; set { isOpen = value; Update(); } }
    public bool IsClosable { get => isClosable; set { isClosable = value; Update(); } }

    private void Update()
    {
        Visibility = isOpen ? Visibility.Visible : Visibility.Collapsed;
        closeButton.Visibility = isClosable ? Visibility.Visible : Visibility.Collapsed;
        var (barColor, bgColor) = severity switch
        {
            InfoSeverity.Success => (Theme.Positive, Theme.PositiveMuted),
            InfoSeverity.Warning => (Theme.Warning, Theme.Solid(0x32, 0x22, 0x0E)),
            InfoSeverity.Error => (Theme.Negative, Theme.NegativeMuted),
            _ => (Theme.Info, Theme.Solid(0x0E, 0x23, 0x33)),
        };
        accent.Background = barColor;
        titleText.Foreground = barColor;
        container.Background = bgColor;
    }
}
