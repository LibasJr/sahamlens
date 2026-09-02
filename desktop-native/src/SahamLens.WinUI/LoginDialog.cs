using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SahamLens.Application;

namespace SahamLens.WinUI;

public sealed class LoginDialog : ContentDialog
{
    private readonly ISahamLensApi api;
    private readonly TextBox email = new() { Header = "Email", PlaceholderText = "nama@email.com" };
    private readonly PasswordBox password = new() { Header = "Password", PlaceholderText = "••••••••" };
    private readonly InfoBar error = new() { IsOpen = false, Severity = InfoBarSeverity.Error, IsClosable = false };
    private readonly ProgressRing progress = new() { IsActive = false, Width = 28, Height = 28, HorizontalAlignment = HorizontalAlignment.Left };

    public LoginDialog(ISahamLensApi api)
    {
        this.api = api;
        Title = "Masuk ke SahamLens";
        PrimaryButtonText = "Masuk";
        CloseButtonText = "Batal";
        DefaultButton = ContentDialogButton.Primary;
        Content = new StackPanel { Spacing = 12, Width = 380, Children = { new TextBlock { Text = "Sesi disimpan terenkripsi oleh Windows Password Vault.", TextWrapping = TextWrapping.Wrap, Opacity = 0.7 }, email, password, progress, error } };
        PrimaryButtonClick += OnLogin;
    }

    private async void OnLogin(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        var deferral = args.GetDeferral(); args.Cancel = true; error.IsOpen = false;
        if (string.IsNullOrWhiteSpace(email.Text) || string.IsNullOrWhiteSpace(password.Password))
        {
            error.Message = "Email dan password wajib diisi."; error.IsOpen = true; deferral.Complete(); return;
        }
        try
        {
            IsPrimaryButtonEnabled = false; progress.IsActive = true;
            await api.LoginAsync(email.Text.Trim(), password.Password);
            args.Cancel = false;
        }
        catch (Exception exception) { error.Message = exception.Message; error.IsOpen = true; }
        finally { progress.IsActive = false; IsPrimaryButtonEnabled = true; deferral.Complete(); }
    }
}
