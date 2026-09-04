using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

try
{
    var installDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "SahamLens Native");
    Directory.CreateDirectory(installDirectory);
    var payloadPath = Path.Combine(Path.GetTempPath(), $"SahamLens-{Guid.NewGuid():N}.zip");
    await using (var source = Assembly.GetExecutingAssembly().GetManifestResourceStream("SahamLens.Payload.zip") ?? throw new InvalidOperationException("Payload installer tidak ditemukan."))
    await using (var target = File.Create(payloadPath)) await source.CopyToAsync(target);
    ZipFile.ExtractToDirectory(payloadPath, installDirectory, true);
    File.Delete(payloadPath);

    var executable = Path.Combine(installDirectory, "SahamLens.Wpf.exe");

    // Create desktop shortcut if possible
    try
    {
        CreateShortcut(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "SahamLens Native.lnk"),
            executable,
            installDirectory);

        CreateShortcut(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "SahamLens Native.lnk"),
            executable,
            installDirectory);
    }
    catch
    {
        // Shortcut creation is nice-to-have, don't fail installation if shell script is restricted
    }

    Process.Start(new ProcessStartInfo(executable) { WorkingDirectory = installDirectory, UseShellExecute = true });
}
catch (Exception error)
{
    MessageBox.Show(error.Message, "SahamLens Native Installer", MessageBoxButtons.OK, MessageBoxIcon.Error);
    Environment.ExitCode = 1;
}

static void CreateShortcut(string shortcutPath, string targetPath, string workingDir)
{
    var script = $"$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{shortcutPath.Replace("'", "''")}'); $s.TargetPath = '{targetPath.Replace("'", "''")}'; $s.WorkingDirectory = '{workingDir.Replace("'", "''")}'; $s.Save()";
    var psi = new ProcessStartInfo
    {
        FileName = "powershell",
        Arguments = $"-NoProfile -WindowStyle Hidden -Command \"{script}\"",
        CreateNoWindow = true,
        UseShellExecute = false
    };
    using var proc = Process.Start(psi);
    proc?.WaitForExit(3000);
}
