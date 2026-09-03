using System.Runtime.CompilerServices;
using System.Threading;

namespace SahamLens.WinUI;

/// <summary>
/// Runs when the assembly loads, before the generated Main and before App's
/// constructor. The previous crash handler (App.UnhandledException) only activates
/// once InitializeComponent() has already succeeded and the WinUI message loop is
/// pumping - a failure inside InitializeComponent itself, or anything before it,
/// produced no window, no crash file, and no Event Viewer entry. This hooks the
/// process-wide handlers early enough to catch that.
/// </summary>
internal static class StartupDiagnostics
{
    [ModuleInitializer]
    internal static void Init()
    {
        CrashLog.Write("Module initializer ran (assembly loaded)", null);
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            CrashLog.Write("AppDomain.UnhandledException", e.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            CrashLog.Write("TaskScheduler.UnobservedTaskException", e.Exception);
            e.SetObserved();
        };
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
