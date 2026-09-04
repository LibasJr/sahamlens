using System.Windows;
using System.Windows.Controls;
using SahamLens.Application;
using SahamLens.Wpf.Controls;

namespace SahamLens.Wpf;

public sealed class LoginWindow : Window
{
    private readonly ISahamLensApi api;
    private readonly TextBox email = Theme.Field(new TextBox { Height = 36, VerticalContentAlignment = VerticalAlignment.Center });
    private readonly PasswordBox password = Theme.Field(new PasswordBox { Height = 36, VerticalContentAlignment = VerticalAlignment.Center });
    private readonly InfoBar error = new() { IsOpen = false, Severity = InfoSeverity.Error, IsClosable = false };
    private readonly LoadingRing progress = new();
    private readonly Button primary;

    public LoginWindow(ISahamLensApi api)
    {
        this.api = api;
        Title = "Masuk ke Akun SahamLens";
        SizeToContent = SizeToContent.WidthAndHeight;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        Background = Theme.Background;
        Foreground = Theme.Foreground;
        FontFamily = Theme.PrimaryFont;
        FontSize = 13;

        primary = Theme.PrimaryButton("Masuk");
        primary.Height = 36;
        primary.Click += async (_, _) => await OnLoginAsync();

        var cancel = Theme.SecondaryButton("Batal");
        cancel.Height = 36;
        cancel.Click += (_, _) => { DialogResult = false; Close(); };

        var buttons = Layout.HStack(10, cancel, primary);
        buttons.HorizontalAlignment = HorizontalAlignment.Right;

        var header = Layout.VStack(4,
            new TextBlock { Text = "Autentikasi SahamLens", FontSize = 18, FontWeight = FontWeights.Bold, Foreground = Theme.Foreground },
            new TextBlock { Text = "Sesi akun Anda disimpan secara aman menggunakan enkripsi Windows DPAPI.", TextWrapping = TextWrapping.Wrap, Foreground = Theme.SecondaryForeground, FontSize = 12 });

        var cardBody = Layout.VStack(14,
            header,
            Layout.Labeled("Email Akun", email),
            Layout.Labeled("Password", password),
            progress,
            error,
            buttons);

        var card = Theme.CardContainer(cardBody, new Thickness(24));
        card.Width = 420;
        card.Margin = new Thickness(20);
        Content = card;
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
