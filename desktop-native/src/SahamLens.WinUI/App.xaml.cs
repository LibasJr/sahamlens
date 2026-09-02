using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using SahamLens.Application;
using SahamLens.Infrastructure;

namespace SahamLens.WinUI;

public partial class App : Application
{
    private Window? window;
    public IServiceProvider Services { get; }

    public App()
    {
        InitializeComponent();
        var services = new ServiceCollection();
        services.AddSingleton<ISessionStore, WindowsSessionStore>();
        services.AddHttpClient<ISahamLensApi, SahamLensApiClient>(client =>
        {
            client.BaseAddress = new Uri("https://sahamlens.id");
            client.Timeout = TimeSpan.FromSeconds(30);
        });
        services.AddSingleton<MainWindow>();
        Services = services.BuildServiceProvider();
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        window = Services.GetRequiredService<MainWindow>();
        window.Activate();
    }
}
