using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace SahamLens.Wpf.Controls;

public enum InfoSeverity { Informational, Success, Warning, Error }

/// <summary>Small stand-in for WinUI's InfoBar - WPF has no built-in equivalent.</summary>
public sealed class InfoBar : UserControl
{
    private readonly Border accent = new() { Width = 4, HorizontalAlignment = HorizontalAlignment.Left };
    private readonly TextBlock titleText = new() { FontWeight = FontWeights.SemiBold };
    private readonly TextBlock messageText = new() { TextWrapping = TextWrapping.Wrap, Opacity = 0.85 };
    private readonly Button closeButton = new() { Content = "✕", Padding = new Thickness(6, 2, 6, 2), HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top };

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
        var text = Layout.VStack(2, titleText, messageText);
        text.Margin = new Thickness(10, 8, 10, 8);
        Grid.SetColumn(text, 1);
        Grid.SetColumn(closeButton, 2);
        grid.Children.Add(accent);
        grid.Children.Add(text);
        grid.Children.Add(closeButton);
        Content = new Border { Background = (Brush)Application.Current.Resources["CardBrush"], CornerRadius = new CornerRadius(8), Child = grid };
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
        accent.Background = new SolidColorBrush(severity switch
        {
            InfoSeverity.Success => Color.FromRgb(0x22, 0xC5, 0x5E),
            InfoSeverity.Warning => Color.FromRgb(0xF5, 0x9E, 0x0B),
            InfoSeverity.Error => Color.FromRgb(0xEF, 0x44, 0x44),
            _ => Color.FromRgb(0x60, 0xA5, 0xFA),
        });
    }
}
