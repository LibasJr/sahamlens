using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using SahamLens.Application;
using SahamLens.Domain;
using SahamLens.Wpf.Controls;

namespace SahamLens.Wpf.Views;

public sealed class AdminModuleView : UserControl
{
    private readonly ISahamLensApi api;
    private readonly ProductModule module;
    private readonly StackPanel body = new();
    private readonly LoadingRing loading = new();
    private readonly InfoBar state = new() { IsOpen = false, IsClosable = false };

    public AdminModuleView(ISahamLensApi api, ProductModule module)
    {
        this.api = api; this.module = module;
        var refresh = new Button { Content = "Refresh data", HorizontalAlignment = HorizontalAlignment.Right };
        refresh.Click += async (_, _) => await LoadAsync();
        var header = new Grid();
        header.ColumnDefinitions.Add(new ColumnDefinition());
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        header.Children.Add(Layout.VStack(2,
            new TextBlock { Text = module.Label, FontSize = 22, FontWeight = FontWeights.SemiBold },
            new TextBlock { Text = "Modul operator native · role admin diverifikasi server", Opacity = .65 }));
        Grid.SetColumn(refresh, 1); header.Children.Add(refresh);
        Content = Layout.VStack(12, header, state, loading, body);
        Loaded += async (_, _) => await LoadAsync();
    }

    private async Task LoadAsync()
    {
        loading.IsActive = true; state.IsOpen = false; body.Children.Clear();
        try
        {
            using var result = await api.SendAsync(module);
            Render(result.RootElement, body, 0);
            state.Severity = InfoSeverity.Success; state.Title = "Data admin aktual"; state.Message = "Dimuat langsung dari API SahamLens."; state.IsOpen = true;
        }
        catch (Exception error) { state.Severity = InfoSeverity.Error; state.Title = "Modul admin gagal dimuat"; state.Message = error.Message; state.IsOpen = true; }
        finally { loading.IsActive = false; }
    }

    private static void Render(JsonElement node, StackPanel host, int depth)
    {
        if (depth > 4) return;
        if (node.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in node.EnumerateObject())
            {
                if (property.Value.ValueKind is JsonValueKind.Object or JsonValueKind.Array)
                {
                    var nested = new StackPanel { Margin = new Thickness(8) }; Render(property.Value, nested, depth + 1);
                    var section = new Expander { Header = Humanize(property.Name), IsExpanded = depth < 1, Content = nested, Margin = new Thickness(0, 0, 0, 7) };
                    host.Children.Add(section);
                }
                else Layout.AddSpaced(host, 3, Metric(Humanize(property.Name), Scalar(property.Value)));
            }
        }
        else if (node.ValueKind == JsonValueKind.Array)
        {
            var index = 0;
            foreach (var item in node.EnumerateArray().Take(100))
            {
                if (item.ValueKind == JsonValueKind.Object)
                {
                    var card = new StackPanel(); Render(item, card, depth + 1);
                    var border = new Border { Background = (Brush)Application.Current.Resources["CardBrush"], CornerRadius = new CornerRadius(9), Padding = new Thickness(12), Child = card, Margin = new Thickness(0, 0, 0, 6) };
                    host.Children.Add(border);
                }
                else Layout.AddSpaced(host, 3, Metric($"Item {++index}", Scalar(item)));
            }
        }
    }

    private static UIElement Metric(string label, string value)
    {
        var grid = new Grid { Margin = new Thickness(10, 7, 10, 7) };
        grid.ColumnDefinitions.Add(new ColumnDefinition());
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.Children.Add(new TextBlock { Text = label, Opacity = .7 });
        var text = new TextBlock { Text = value, FontWeight = FontWeights.SemiBold, MaxWidth = 650, TextWrapping = TextWrapping.Wrap };
        Grid.SetColumn(text, 1); grid.Children.Add(text); return grid;
    }
    private static string Scalar(JsonElement value) => value.ValueKind == JsonValueKind.String ? value.GetString() ?? "—" : value.GetRawText();
    private static string Humanize(string text) => string.Concat(text.Select((ch, i) => i > 0 && char.IsUpper(ch) ? " " + ch : ch.ToString())).Replace('_', ' ');
}
