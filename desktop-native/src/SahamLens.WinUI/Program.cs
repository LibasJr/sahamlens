using System.Threading;

namespace SahamLens.WinUI;

/// <summary>
/// Manual entry point (GenerateProgramFile=false in the csproj) so startup failures —
/// including ones inside App's constructor / InitializeComponent, before the WinUI
/// message loop exists — get logged. The previous auto-generated Main gave no signal
/// at all when startup failed early: no window, no crash file, nothing in Event Viewer.
/// </summary>
public static class Program
{
    [STAThread]
    private static void Main()
    {
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            CrashLog.Write("AppDomain.UnhandledException", e.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            CrashLog.Write("TaskScheduler.UnobservedTaskException", e.Exception);
            e.SetObserved();
        };

        CrashLog.Write("Main() entered", null);

        try
        {
            WinRT.ComWrappersSupport.InitializeComWrappers();
            Microsoft.UI.Xaml.Application.Start(_ =>
            {
                var context = new Microsoft.UI.Dispatching.DispatcherQueueSynchronizationContext(
                    Microsoft.UI.Dispatching.DispatcherQueue.GetForCurrentThread());
                SynchronizationContext.SetSynchronizationContext(context);
                _ = new App();
            });
        }
        catch (Exception ex)
        {
            CrashLog.Write("Main() Application.Start threw", ex);
            throw;
        }
    }
}

internal static class CrashLog
{
    private static readonly string LogPath = Path.Combine(Path.GetTempPath(), "SahamLens-Native-crash.txt");

    public static void Write(string source, Exception? ex)
    {
        try
        {
            var line = $"[{DateTime.Now:O}] {source}{(ex is null ? string.Empty : $"\n{ex}")}\n";
            File.AppendAllText(LogPath, line);
        }
        catch
        {
            // Diagnostics must never be the reason startup fails.
        }
    }
}
