using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SahamLens.Application;
using SahamLens.Domain;

namespace SahamLens.WinUI.Views;

public sealed partial class ScreenerView : UserControl
{
    private readonly ISahamLensApi api;
    public ScreenerView(ISahamLensApi api) { this.api = api; InitializeComponent(); Loaded += async (_, _) => await LoadAsync(); }
    private async void OnRefresh(object sender, RoutedEventArgs e) => await LoadAsync();
    private async Task LoadAsync()
    {
        Loading.IsActive = true;
        try
        {
            var profile = ((ComboBoxItem)Profile.SelectedItem).Content.ToString()!;
            var module = ProductCatalog.Get("screener") with { Endpoint = $"/api/screener?profile={Uri.EscapeDataString(profile)}" };
            var result = await api.SendAsync<ScreenerResult>(module);
            Results.ItemsSource = result.Analysis.Stocks;
            Summary.Text = $"{result.Analysis.Stocks.Count} dari {result.Analysis.TotalCount} hasil · {result.Profile}";
            GuestWarning.IsOpen = result.Analysis.IsGuestLimited;
            if (result.Analysis.IsGuestLimited) Summary.Text += $" · {result.Analysis.LockedCount} dikunci";
            Sector.Items.Clear(); Sector.Items.Add(new ComboBoxItem { Content = "Semua sektor" });
            foreach (var sector in result.AvailableSectors) Sector.Items.Add(new ComboBoxItem { Content = sector });
            Sector.SelectedIndex = 0;
        }
        catch (Exception error) { GuestWarning.Severity = InfoBarSeverity.Error; GuestWarning.Title = "Screener gagal dimuat"; GuestWarning.Message = error.Message; GuestWarning.IsOpen = true; }
        finally { Loading.IsActive = false; }
    }
}
