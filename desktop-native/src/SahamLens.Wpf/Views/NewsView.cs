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
        var header = Layout.VStack(4,
            new TextBlock { Text = "News Pasar Terkini & Analisis Sentimen", FontSize = 20, FontWeight = FontWeights.Bold, Foreground = Theme.Foreground },
            new TextBlock { Text = "Agregasi berita emiten dan pasar modal Indonesia dari portal finansial terverifikasi.", Foreground = Theme.SecondaryForeground, FontSize = 13 });

        Content = Layout.VStack(16,
            header,
            loading,
            feed);

        Loaded += async (_, _) =>
        {
            try
            {
                var result = await api.SendAsync<NewsResult>(ProductCatalog.Get("news"));
                feed.Children.Clear();
                foreach (var item in result.Items.Take(40)) Layout.AddSpaced(feed, 12, Card(item));
                if (!result.Items.Any())
                {
                    feed.Children.Add(new TextBlock
                    {
                        Text = "Belum ada berita pasar terbaru saat ini.",
                        Foreground = Theme.SecondaryForeground,
                        FontSize = 13
                    });
                }
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
        var isPositive = item.Sentiment?.Equals("POSITIF", StringComparison.OrdinalIgnoreCase) == true;
        var isNegative = item.Sentiment?.Equals("NEGATIF", StringComparison.OrdinalIgnoreCase) == true;

        var sentimentBadge = Layout.PillBadge(
            item.Sentiment ?? "NETRAL",
            isPositive ? Theme.PositiveMuted : isNegative ? Theme.NegativeMuted : Theme.Solid(0x1E, 0x29, 0x3B),
            isPositive ? Theme.Positive : isNegative ? Theme.Negative : Theme.SecondaryForeground
        );

        var header = new Grid();
        header.ColumnDefinitions.Add(new ColumnDefinition());
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

        var meta = Layout.HStack(8,
            new TextBlock { Text = "📰", FontSize = 12, VerticalAlignment = VerticalAlignment.Center },
            new TextBlock { Text = $"{item.Source}  •  {item.PublishedAt}", Foreground = Theme.SubtleForeground, FontSize = 12, VerticalAlignment = VerticalAlignment.Center });

        header.Children.Add(meta);
        Grid.SetColumn(sentimentBadge, 1);
        header.Children.Add(sentimentBadge);

        var body = Layout.VStack(8,
            header,
            new TextBlock { Text = item.Title, FontSize = 15, FontWeight = FontWeights.SemiBold, Foreground = Theme.Foreground, TextWrapping = TextWrapping.Wrap },
            new TextBlock { Text = item.Summary ?? "Ringkasan berita tidak tersedia.", Foreground = Theme.SecondaryForeground, FontSize = 13, TextWrapping = TextWrapping.Wrap, LineHeight = 19, MaxHeight = 65 });

        var cardBorder = Theme.CardContainer(body, new Thickness(18, 14, 18, 14));
        cardBorder.MouseEnter += (_, _) => cardBorder.Background = Theme.CardHover;
        cardBorder.MouseLeave += (_, _) => cardBorder.Background = Theme.Card;
        return cardBorder;
    }
}
