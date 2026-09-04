using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using SahamLens.Application;
using SahamLens.Domain;
using SahamLens.Wpf.Controls;

namespace SahamLens.Wpf.Views;

/// <summary>
/// Native renderer for strongly-routed analysis and research modules.
/// Values are rendered as labelled native metrics instead of opaque payload text.
/// </summary>
public sealed class StructuredModuleView : UserControl
{
    private readonly ISahamLensApi api;
    private readonly ProductModule module;
    private readonly string ticker;
    private readonly StackPanel results = new();
    private readonly LoadingRing loading = new();
    private readonly InfoBar state = new() { IsOpen = false, IsClosable = false };
    private readonly NumberBox capital = new() { Header = "Modal Investasi (Rp)", Value = 100_000_000, Minimum = 1_000_000, Width = 260 };
    private readonly NumberBox target = new() { Header = "Target Bulanan / Toleransi Risiko (%)", Value = 1_000_000, Minimum = 0, Width = 260 };

    public StructuredModuleView(ISahamLensApi api, ProductModule module, string ticker)
    {
        this.api = api; this.module = module; this.ticker = ticker;
        var title = new TextBlock { Text = module.Label, FontSize = 22, FontWeight = FontWeights.Bold, Foreground = Theme.Foreground };
        var subtitle = new TextBlock { Text = $"{ticker}  •  Data aktual via endpoint {module.Endpoint}", Foreground = Theme.SecondaryForeground, FontSize = 12 };
        var refresh = Theme.PrimaryButton(module.Method == "POST" ? "Hitung Kalkulasi" : "Refresh Data");
        refresh.Height = 36;
        refresh.Click += async (_, _) => await LoadAsync();

        var headerCard = Theme.CardContainer(Layout.VStack(8,
            title,
            subtitle,
            (module.Method == "POST" || module.Id == "dividend") ? Layout.HStack(14, capital, target) : new StackPanel(),
            refresh),
            new Thickness(18, 14, 18, 14));

        var root = Layout.VStack(14,
            headerCard,
            state,
            loading,
            results);

        Content = new ScrollViewer { Content = root, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        Loaded += async (_, _) => await LoadAsync();
    }

    private object? RequestBody() => module.Id switch
    {
        "risk" => new { portfolio = new[] { new { ticker, weight = 100 } } },
        "position-sizing" => new { portfolio = new[] { new { ticker, weight = 100 } }, capital = capital.Value, riskPercent = target.Value },
        "dividend" => new { capital = capital.Value, targetMonthly = target.Value, ticker },
        _ => null
    };

    private async Task LoadAsync()
    {
        loading.IsActive = true; state.IsOpen = false; results.Children.Clear();
        try
        {
            using var document = module.Id == "dividend"
                ? await api.SendPathAsync($"/api/dividend-plan?mode=ticker&ticker={Uri.EscapeDataString(ticker)}&capital={capital.Value:0}&targetMonthly={target.Value:0}", access: module.Access)
                : await api.SendAsync(module, module.RequiresTicker ? ticker : null, RequestBody());
            var node = Unwrap(document.RootElement);
            Render(node, results, 0);
            state.Severity = InfoSeverity.Success; state.Title = $"{module.Label} siap";
            state.Message = module.Id == "consensus" ? "Lens AI menampilkan nilai dan evidence aktual dari model SahamLens." : "Data berhasil dihitung dan dimuat.";
            state.IsOpen = true;
        }
        catch (Exception error) { state.Severity = InfoSeverity.Error; state.Title = $"{module.Label} gagal"; state.Message = error.Message; state.IsOpen = true; }
        finally { loading.IsActive = false; }
    }

    private static JsonElement Unwrap(JsonElement root) => root.ValueKind == JsonValueKind.Object && root.TryGetProperty("data", out var data) ? data : root;

    private static void Render(JsonElement node, StackPanel host, int depth)
    {
        if (depth > 5) return;
        if (node.ValueKind == JsonValueKind.Object)
        {
            var cardChildren = new StackPanel();
            foreach (var property in node.EnumerateObject())
            {
                if (property.NameEquals("meta") || property.NameEquals("_meta")) continue;
                if (property.Value.ValueKind is JsonValueKind.Object or JsonValueKind.Array)
                {
                    var nested = new StackPanel { Margin = new Thickness(10) };
                    Render(property.Value, nested, depth + 1);
                    var section = new Expander
                    {
                        Header = Label(property.Name),
                        IsExpanded = depth < 2,
                        Content = nested,
                        Margin = new Thickness(0, 0, 0, 8),
                        Foreground = Theme.Foreground,
                        FontWeight = FontWeights.SemiBold,
                        FontSize = 13
                    };
                    cardChildren.Children.Add(section);
                }
                else Layout.AddSpaced(cardChildren, 4, Metric(Label(property.Name), Scalar(property.Value)));
            }

            if (depth == 0)
            {
                var card = Theme.CardContainer(cardChildren, new Thickness(18, 14, 18, 14));
                host.Children.Add(card);
            }
            else
            {
                host.Children.Add(cardChildren);
            }
        }
        else if (node.ValueKind == JsonValueKind.Array)
        {
            var count = 0;
            foreach (var item in node.EnumerateArray().Take(100))
            {
                var card = new StackPanel();
                Render(item, card, depth + 1);
                var border = Theme.CardContainer(card, new Thickness(14));
                border.Margin = new Thickness(0, 0, 0, 8);
                host.Children.Add(border);
                count++;
            }
            if (count == 0) host.Children.Add(new TextBlock { Text = "Belum ada data untuk pilihan ini.", Foreground = Theme.SecondaryForeground, FontSize = 13 });
        }
        else host.Children.Add(Metric("Nilai", Scalar(node)));
    }

    private static UIElement Metric(string label, string value)
    {
        var grid = new Grid { Margin = new Thickness(10, 8, 10, 8) };
        grid.ColumnDefinitions.Add(new ColumnDefinition());
        grid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        grid.Children.Add(new TextBlock { Text = label, Foreground = Theme.SecondaryForeground, FontSize = 13, TextWrapping = TextWrapping.Wrap });
        var result = new TextBlock
        {
            Text = value,
            FontWeight = FontWeights.SemiBold,
            Foreground = Theme.Foreground,
            FontSize = 13,
            MaxWidth = 720,
            TextWrapping = TextWrapping.Wrap
        };
        Grid.SetColumn(result, 1);
        grid.Children.Add(result);

        var border = new Border
        {
            BorderBrush = Theme.Border,
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = grid
        };
        return border;
    }

    private static string Scalar(JsonElement value) => value.ValueKind switch { JsonValueKind.String => value.GetString() ?? "—", JsonValueKind.True => "Ya", JsonValueKind.False => "Tidak", JsonValueKind.Null => "—", _ => value.GetRawText() };
    private static string Label(string text) => string.Join(' ', text.Replace('_', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(x => char.ToUpperInvariant(x[0]) + x[1..]));
}
