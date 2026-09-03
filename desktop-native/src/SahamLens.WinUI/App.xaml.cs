using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using SahamLens.Application;
using SahamLens.Infrastructure;

namespace SahamLens.WinUI;

public partial class App : Microsoft.UI.Xaml.Application
{
    private Window? window;
    public IServiceProvider Services { get; }

    public App()
    {
        CrashLog.Write("App() constructor entered", null);
        UnhandledException += (_, args) => CrashLog.Write("Application.UnhandledException", args.Exception);
        InitializeComponent();
        CrashLog.Write("App() InitializeComponent completed", null);
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
        CrashLog.Write("OnLaunched entered", null);
        window = Services.GetRequiredService<MainWindow>();
        CrashLog.Write("MainWindow constructed", null);
        window.Activate();
        CrashLog.Write("MainWindow.Activate() returned", null);
    }
}
