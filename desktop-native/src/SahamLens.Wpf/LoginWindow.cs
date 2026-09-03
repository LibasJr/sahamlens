using System.Windows;
using System.Windows.Controls;
using SahamLens.Application;
using SahamLens.Wpf.Controls;

namespace SahamLens.Wpf;

public sealed class LoginWindow : Window
{
    private readonly ISahamLensApi api;
    private readonly TextBox email = new();
    private readonly PasswordBox password = new();
    private readonly InfoBar error = new() { IsOpen = false, Severity = InfoSeverity.Error, IsClosable = false };
    private readonly LoadingRing progress = new();
    private readonly Button primary = new() { Content = "Masuk" };

    public LoginWindow(ISahamLensApi api)
    {
        this.api = api;
        Title = "Masuk ke SahamLens";
        SizeToContent = SizeToContent.WidthAndHeight;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;

        var cancel = new Button { Content = "Batal" };
        cancel.Click += (_, _) => { DialogResult = false; Close(); };
        primary.Click += async (_, _) => await OnLoginAsync();

        var buttons = Layout.HStack(8, primary, cancel);
        buttons.HorizontalAlignment = HorizontalAlignment.Right;

        var body = Layout.VStack(12,
            new TextBlock { Text = "Sesi disimpan terenkripsi oleh Windows (DPAPI).", TextWrapping = TextWrapping.Wrap, Opacity = 0.7 },
            Layout.Labeled("Email", email),
            Layout.Labeled("Password", password),
            progress, error, buttons);
        body.Width = 380;
        body.Margin = new Thickness(24);
        Content = body;
    }

    private async Task OnLoginAsync()
    {
        error.IsOpen = false;
        if (string.IsNullOrWhiteSpace(email.Text) || string.IsNullOrWhiteSpace(password.Password))
        {
            error.Message = "Email dan password wajib diisi."; error.IsOpen = true; return;
        }
        try
        {
            primary.IsEnabled = false; progress.IsActive = true;
            await api.LoginAsync(email.Text.Trim(), password.Password);
            DialogResult = true;
            Close();
        }
        catch (Exception exception) { error.Message = exception.Message; error.IsOpen = true; }
        finally { progress.IsActive = false; primary.IsEnabled = true; }
    }
}
