using System.Runtime.CompilerServices;
using System.Threading;

namespace SahamLens.Wpf;

/// <summary>
/// Runs when the assembly loads, before the generated Main and before App's
/// constructor - the earliest point custom code can run. Carried over from the
/// WinUI attempt: a naive class named "Program" collided with the framework's own
/// generated entry point (CS0101), so this intentionally has no such name and never
/// touches Main at all.
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
