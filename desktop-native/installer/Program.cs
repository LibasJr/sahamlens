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
    Process.Start(new ProcessStartInfo(executable) { WorkingDirectory = installDirectory, UseShellExecute = true });
}
catch (Exception error)
{
    MessageBox.Show(error.Message, "SahamLens Native Installer", MessageBoxButtons.OK, MessageBoxIcon.Error);
    Environment.ExitCode = 1;
}
