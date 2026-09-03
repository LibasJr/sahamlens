using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using SahamLens.Application;
using SahamLens.Domain;
using SahamLens.Wpf.Controls;

namespace SahamLens.Wpf.Views;

public sealed class NewsView : UserControl
{
    private readonly StackPanel feed = new();
    private readonly LoadingRing loading = new() { IsActive = true };

    public NewsView(ISahamLensApi api)
    {
        Content = Layout.VStack(12,
            new TextBlock { Text = "News pasar terbaru", FontSize = 22, FontWeight = FontWeights.SemiBold },
            new TextBlock { Text = "Berita relevan pasar dari sumber RSS kredibel, dilengkapi sentimen dan ringkasan.", Opacity = .7 },
            loading, feed);
        Loaded += async (_, _) =>
        {
            try
            {
                var result = await api.SendAsync<NewsResult>(ProductCatalog.Get("news"));
                foreach (var item in result.Items.Take(40)) Layout.AddSpaced(feed, 10, Card(item));
                if (!result.Items.Any()) feed.Children.Add(new TextBlock { Text = "Belum ada news pasar terbaru." });
            }
            catch (Exception error)
            {
                var errorBar = new InfoBar { Severity = InfoSeverity.Error, Title = "News gagal dimuat", Message = error.Message, IsOpen = true, IsClosable = false };
                feed.Children.Add(errorBar);
            }
            finally { loading.IsActive = false; }
        };
    }

    private static UIElement Card(NewsItem item)
    {
        var sentimentColor = item.Sentiment == "POSITIF" ? Color.FromArgb(45, 34, 197, 94)
            : item.Sentiment == "NEGATIF" ? Color.FromArgb(45, 239, 68, 68)
            : Color.FromArgb(30, 148, 163, 184);
        var sentiment = new Border { CornerRadius = new CornerRadius(10), Padding = new Thickness(9, 4, 9, 4), Background = new SolidColorBrush(sentimentColor), Child = new TextBlock { Text = item.Sentiment ?? "NETRAL", FontSize = 11 } };
        var header = new Grid();
        header.ColumnDefinitions.Add(new ColumnDefinition());
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        header.Children.Add(new TextBlock { Text = $"{item.Source} · {item.PublishedAt}", Opacity = .6 });
        Grid.SetColumn(sentiment, 1);
        header.Children.Add(sentiment);
        var body = Layout.VStack(7, header,
            new TextBlock { Text = item.Title, FontSize = 16, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap },
            new TextBlock { Text = item.Summary ?? "Ringkasan belum tersedia.", Opacity = .72, TextWrapping = TextWrapping.Wrap, MaxHeight = 60 });
        return new Border { Background = (Brush)Application.Current.Resources["CardBrush"], CornerRadius = new CornerRadius(10), Padding = new Thickness(14), Child = body };
    }
}
