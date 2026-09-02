using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using SahamLens.Application;
using SahamLens.Domain;

namespace SahamLens.WinUI.Views;

public sealed class NewsView : UserControl
{
    private readonly StackPanel feed = new() { Spacing = 10 };
    private readonly ProgressRing loading = new() { IsActive = true, HorizontalAlignment = HorizontalAlignment.Left };
    public NewsView(ISahamLensApi api)
    {
        Content = new StackPanel { Spacing = 12, Children = { new TextBlock { Text = "News pasar terbaru", FontSize = 22, FontWeight = Windows.UI.Text.FontWeights.SemiBold }, new TextBlock { Text = "Berita relevan pasar dari sumber RSS kredibel, dilengkapi sentimen dan ringkasan.", Opacity = .7 }, loading, feed } };
        Loaded += async (_, _) =>
        {
            try
            {
                var result = await api.SendAsync<NewsResult>(ProductCatalog.Get("news"));
                foreach (var item in result.Items.Take(40)) feed.Children.Add(Card(item));
                if (!result.Items.Any()) feed.Children.Add(new TextBlock { Text = "Belum ada news pasar terbaru." });
            }
            catch (Exception error) { feed.Children.Add(new InfoBar { Severity = InfoBarSeverity.Error, Title = "News gagal dimuat", Message = error.Message, IsOpen = true, IsClosable = false }); }
            finally { loading.IsActive = false; }
        };
    }

    private static UIElement Card(NewsItem item)
    {
        var sentiment = new Border { CornerRadius = new CornerRadius(10), Padding = new Thickness(9, 4, 9, 4), Background = new SolidColorBrush(item.Sentiment == "POSITIF" ? Windows.UI.Color.FromArgb(45, 34, 197, 94) : item.Sentiment == "NEGATIF" ? Windows.UI.Color.FromArgb(45, 239, 68, 68) : Windows.UI.Color.FromArgb(30, 148, 163, 184)), Child = new TextBlock { Text = item.Sentiment ?? "NETRAL", FontSize = 11 } };
        var header = new Grid { ColumnDefinitions = { new ColumnDefinition(), new ColumnDefinition { Width = GridLength.Auto } } }; header.Children.Add(new TextBlock { Text = $"{item.Source} · {item.PublishedAt}", Opacity = .6 }); Grid.SetColumn(sentiment, 1); header.Children.Add(sentiment);
        return new Border { Background = (Brush)Application.Current.Resources["CardBrush"], CornerRadius = new CornerRadius(10), Padding = new Thickness(14), Child = new StackPanel { Spacing = 7, Children = { header, new TextBlock { Text = item.Title, FontSize = 16, FontWeight = Windows.UI.Text.FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap }, new TextBlock { Text = item.Summary ?? "Ringkasan belum tersedia.", Opacity = .72, TextWrapping = TextWrapping.Wrap, MaxLines = 3 } } } };
    }
}
