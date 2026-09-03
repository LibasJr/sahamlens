using System.Windows;
using System.Windows.Threading;
using Microsoft.Extensions.DependencyInjection;
using SahamLens.Application;
using SahamLens.Infrastructure;

namespace SahamLens.Wpf;

public partial class App : System.Windows.Application
{
    private Window? window;
    public IServiceProvider Services { get; }

    public App()
    {
        CrashLog.Write("App() constructor entered", null);
        DispatcherUnhandledException += (_, args) =>
            CrashLog.Write("Application.DispatcherUnhandledException", args.Exception);
        InitializeComponent();
        CrashLog.Write("App() InitializeComponent completed", null);

        var services = new ServiceCollection();
        services.AddSingleton<ISessionStore, SecureSessionStore>();
        services.AddHttpClient<ISahamLensApi, SahamLensApiClient>(client =>
        {
            client.BaseAddress = new Uri("https://sahamlens.id");
            client.Timeout = TimeSpan.FromSeconds(30);
        });
        services.AddSingleton<MainWindow>();
        Services = services.BuildServiceProvider();
    }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        CrashLog.Write("OnStartup entered", null);
        window = Services.GetRequiredService<MainWindow>();
        CrashLog.Write("MainWindow constructed", null);
        window.Show();
        CrashLog.Write("MainWindow.Show() returned", null);
    }
}
