//go:build windows

package main

import (
	"archive/zip"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

const (
	appName        = "Stellar Client"
	executableName = "Minecraft"
	runtimeVersion = "43.1.1"
	runtimeSHA256  = "b4e9995cd3f65785eb8818276aa9020f3165ab11da41b3c762616d4a0ad8c7ad"
)

var runtimeURLs = []string{
	"https://github.com/electron/electron/releases/download/v43.1.1/electron-v43.1.1-win32-x64.zip",
	"https://npmmirror.com/mirrors/electron/43.1.1/electron-v43.1.1-win32-x64.zip",
}

//go:embed embed/app.zip embed/app-version.txt embed/logo-static.png
var embedded embed.FS

var (
	user32          = syscall.NewLazyDLL("user32.dll")
	shell32         = syscall.NewLazyDLL("shell32.dll")
	procMessageBoxW = user32.NewProc("MessageBoxW")
	procShellExecW  = shell32.NewProc("ShellExecuteW")
)

func utf16Ptr(value string) *uint16 {
	ptr, _ := syscall.UTF16PtrFromString(value)
	return ptr
}

func messageBox(title, text string, flags uintptr) {
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16Ptr(text))), uintptr(unsafe.Pointer(utf16Ptr(title))), flags)
}

func fail(err error) {
	messageBox(appName, "Impossibile avviare Stellar Client.\n\n"+err.Error(), 0x10)
	os.Exit(1)
}

func installRoot() (string, error) {
	base := strings.TrimSpace(os.Getenv("LOCALAPPDATA"))
	if base == "" {
		dir, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		base = dir
	}
	return filepath.Join(base, "Programs", appName), nil
}

func markerMatches(root, appVersion string) bool {
	runtimeMarker, err := os.ReadFile(filepath.Join(root, ".runtime-version"))
	if err != nil || strings.TrimSpace(string(runtimeMarker)) != runtimeVersion {
		return false
	}
	appMarker, err := os.ReadFile(filepath.Join(root, ".app-version"))
	if err != nil || strings.TrimSpace(string(appMarker)) != appVersion {
		return false
	}
	required := []string{
		filepath.Join(root, executableName+".exe"),
		filepath.Join(root, "resources", "app", "package.json"),
		filepath.Join(root, "resources", "app", "src", "main.js"),
	}
	for _, file := range required {
		if info, err := os.Stat(file); err != nil || info.IsDir() {
			return false
		}
	}
	return true
}

func downloadRuntime(target string) error {
	client := &http.Client{Timeout: 30 * time.Minute}
	var failures []string
	for _, source := range runtimeURLs {
		if err := downloadOne(client, source, target); err == nil {
			return nil
		} else {
			failures = append(failures, err.Error())
			_ = os.Remove(target)
		}
	}
	return fmt.Errorf("download del runtime non riuscito:\n%s", strings.Join(failures, "\n"))
}

func downloadOne(client *http.Client, source, target string) error {
	request, err := http.NewRequest(http.MethodGet, source, nil)
	if err != nil {
		return err
	}
	request.Header.Set("User-Agent", "StellarClientBootstrap/1.7.0")
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("%s: %w", source, err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("%s: risposta HTTP %d", source, response.StatusCode)
	}

	file, err := os.Create(target)
	if err != nil {
		return err
	}
	hash := sha256.New()
	_, copyErr := io.Copy(io.MultiWriter(file, hash), response.Body)
	closeErr := file.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if !strings.EqualFold(actual, runtimeSHA256) {
		return fmt.Errorf("controllo integrità fallito (SHA-256 %s)", actual)
	}
	return nil
}

func extractZip(zipPath, target string) error {
	archive, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer archive.Close()
	cleanTarget, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	for _, entry := range archive.File {
		destination := filepath.Join(cleanTarget, filepath.FromSlash(entry.Name))
		cleanDestination, err := filepath.Abs(destination)
		if err != nil {
			return err
		}
		if cleanDestination != cleanTarget && !strings.HasPrefix(cleanDestination, cleanTarget+string(os.PathSeparator)) {
			return errors.New("archivio non sicuro: percorso esterno alla destinazione")
		}
		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(cleanDestination, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(cleanDestination), 0755); err != nil {
			return err
		}
		input, err := entry.Open()
		if err != nil {
			return err
		}
		output, err := os.OpenFile(cleanDestination, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, entry.Mode())
		if err != nil {
			input.Close()
			return err
		}
		_, copyErr := io.Copy(output, input)
		input.Close()
		closeErr := output.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
}

func extractEmbeddedApp(target string) error {
	appArchive, err := embedded.ReadFile("embed/app.zip")
	if err != nil {
		return err
	}
	tempArchive := filepath.Join(os.TempDir(), fmt.Sprintf("stellar-app-%d.zip", time.Now().UnixNano()))
	if err := os.WriteFile(tempArchive, appArchive, 0600); err != nil {
		return err
	}
	defer os.Remove(tempArchive)
	return extractZip(tempArchive, target)
}

func powershellEncodedCommand(script string) string {
	encoded := utf16.Encode([]rune(script))
	bytes := make([]byte, len(encoded)*2)
	for index, value := range encoded {
		bytes[index*2] = byte(value)
		bytes[index*2+1] = byte(value >> 8)
	}
	return base64.StdEncoding.EncodeToString(bytes)
}

func startInstallerWindow(imagePath string) *exec.Cmd {
	imageURI := "file:///" + strings.ReplaceAll(filepath.ToSlash(imagePath), " ", "%20")
	script := fmt.Sprintf(`Add-Type -AssemblyName PresentationFramework;
[xml]$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Width="470" Height="470" WindowStartupLocation="CenterScreen"
        WindowStyle="None" ResizeMode="NoResize" AllowsTransparency="True"
        Background="Transparent" Topmost="True" ShowInTaskbar="True">
  <Window.Resources>
    <Storyboard x:Key="RotateRing" RepeatBehavior="Forever">
      <DoubleAnimation Storyboard.TargetName="RingRotate" Storyboard.TargetProperty="Angle" From="0" To="360" Duration="0:0:8"/>
    </Storyboard>
    <Storyboard x:Key="PulseLogo" RepeatBehavior="Forever" AutoReverse="True">
      <DoubleAnimation Storyboard.TargetName="LogoScale" Storyboard.TargetProperty="ScaleX" From="1" To="1.035" Duration="0:0:1.8"/>
      <DoubleAnimation Storyboard.TargetName="LogoScale" Storyboard.TargetProperty="ScaleY" From="1" To="1.035" Duration="0:0:1.8"/>
    </Storyboard>
  </Window.Resources>
  <Border Background="#FC050508" BorderBrush="#342A45" BorderThickness="1" CornerRadius="32" Padding="34">
    <Grid>
      <Grid.RowDefinitions>
        <RowDefinition Height="*"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/>
      </Grid.RowDefinitions>
      <Grid Width="280" Height="280" HorizontalAlignment="Center" VerticalAlignment="Center">
        <Ellipse Width="266" Height="266" Stroke="#492A78" StrokeThickness="1" Opacity="0.55"/>
        <Ellipse Width="228" Height="228" Stroke="#9A67F7" StrokeThickness="2">
          <Ellipse.RenderTransform><RotateTransform x:Name="RingRotate" CenterX="114" CenterY="114"/></Ellipse.RenderTransform>
          <Ellipse.StrokeDashArray>2 8</Ellipse.StrokeDashArray>
        </Ellipse>
        <Border Width="176" Height="176" CornerRadius="88" Background="#FF000000" BorderBrush="#65449A" BorderThickness="1">
          <Image Source="%s" Width="174" Height="174" Stretch="UniformToFill">
            <Image.RenderTransform><ScaleTransform x:Name="LogoScale" CenterX="87" CenterY="87"/></Image.RenderTransform>
          </Image>
        </Border>
      </Grid>
      <TextBlock Grid.Row="1" Text="STELLAR CLIENT" Foreground="#F5F0FF" FontSize="16" FontWeight="SemiBold" CharacterSpacing="260" HorizontalAlignment="Center" Margin="0,3,0,0"/>
      <TextBlock Grid.Row="2" Text="Preparazione file…" Foreground="#B492F0" FontSize="12" HorizontalAlignment="Center" Margin="0,18,0,16"/>
      <ProgressBar Grid.Row="3" Height="7" Width="300" IsIndeterminate="True" Foreground="#9365F4" Background="#1A1524" BorderThickness="0" HorizontalAlignment="Center"/>
    </Grid>
  </Border>
</Window>
'@;
$reader = New-Object System.Xml.XmlNodeReader $xaml;
$window = [Windows.Markup.XamlReader]::Load($reader);
$window.Add_Loaded({
  $window.Resources['RotateRing'].Begin($window, $true);
  $window.Resources['PulseLogo'].Begin($window, $true);
});
$window.ShowDialog() | Out-Null;`, psEscape(imageURI))
	command := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Sta", "-WindowStyle", "Hidden", "-EncodedCommand", powershellEncodedCommand(script))
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := command.Start(); err != nil {
		return nil
	}
	return command
}

func closeInstallerWindow(command *exec.Cmd) {
	if command == nil || command.Process == nil {
		return
	}
	_ = command.Process.Kill()
	_, _ = command.Process.Wait()
}

func install(root, appVersion string) error {
	logoBytes, logoErr := embedded.ReadFile("embed/logo-static.png")
	logoPath := filepath.Join(os.TempDir(), fmt.Sprintf("stellar-logo-%d.png", time.Now().UnixNano()))
	if logoErr == nil {
		_ = os.WriteFile(logoPath, logoBytes, 0600)
		defer os.Remove(logoPath)
	}
	installerWindow := startInstallerWindow(logoPath)
	defer closeInstallerWindow(installerWindow)

	parent := filepath.Dir(root)
	if err := os.MkdirAll(parent, 0755); err != nil {
		return err
	}
	stage, err := os.MkdirTemp(parent, ".stellar-install-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)

	runtimeZip := filepath.Join(os.TempDir(), fmt.Sprintf("electron-%s-%d.zip", runtimeVersion, time.Now().UnixNano()))
	defer os.Remove(runtimeZip)
	if err := downloadRuntime(runtimeZip); err != nil {
		return err
	}
	if err := extractZip(runtimeZip, stage); err != nil {
		return fmt.Errorf("estrazione runtime: %w", err)
	}

	originalExe := filepath.Join(stage, "electron.exe")
	brandedExe := filepath.Join(stage, executableName+".exe")
	if err := os.Rename(originalExe, brandedExe); err != nil {
		return fmt.Errorf("preparazione eseguibile: %w", err)
	}
	_ = os.Remove(filepath.Join(stage, "resources", "default_app.asar"))
	appDir := filepath.Join(stage, "resources", "app")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return err
	}
	if err := extractEmbeddedApp(appDir); err != nil {
		return fmt.Errorf("installazione applicazione: %w", err)
	}
	if err := os.WriteFile(filepath.Join(stage, ".runtime-version"), []byte(runtimeVersion+"\n"), 0644); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(stage, ".app-version"), []byte(appVersion+"\n"), 0644); err != nil {
		return err
	}

	oldRoot := root + ".old"
	_ = os.RemoveAll(oldRoot)
	if _, err := os.Stat(root); err == nil {
		if err := os.Rename(root, oldRoot); err != nil {
			return fmt.Errorf("aggiornamento installazione: %w", err)
		}
	}
	if err := os.Rename(stage, root); err != nil {
		_ = os.Rename(oldRoot, root)
		return err
	}
	_ = os.RemoveAll(oldRoot)
	createShortcuts(root)
	return nil
}

func psEscape(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func createShortcuts(root string) {
	executable := filepath.Join(root, executableName+".exe")
	icon := filepath.Join(root, "resources", "app", "build", "icon.ico")
	script := fmt.Sprintf(`$ws = New-Object -ComObject WScript.Shell; `+
		`$desktop = [Environment]::GetFolderPath('Desktop'); `+
		`$programs = [Environment]::GetFolderPath('Programs'); `+
		`$targets = @((Join-Path $desktop '%s.lnk'), (Join-Path $programs '%s.lnk')); `+
		`foreach ($target in $targets) { $s = $ws.CreateShortcut($target); $s.TargetPath = '%s'; $s.WorkingDirectory = '%s'; $s.IconLocation = '%s,0'; $s.Save() }`,
		appName, appName, psEscape(executable), psEscape(root), psEscape(icon))
	command := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", script)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = command.Run()
}

func launch(executable string) error {
	if _, err := os.Stat(executable); err != nil {
		return err
	}
	verb := utf16Ptr("open")
	file := utf16Ptr(executable)
	directory := utf16Ptr(filepath.Dir(executable))
	result, _, callErr := procShellExecW.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(file)), 0, uintptr(unsafe.Pointer(directory)), 1)
	if result <= 32 {
		return fmt.Errorf("avvio non riuscito (codice %d): %v", result, callErr)
	}
	return nil
}

func main() {
	versionBytes, err := embedded.ReadFile("embed/app-version.txt")
	if err != nil {
		fail(err)
	}
	appVersion := strings.TrimSpace(string(versionBytes))
	root, err := installRoot()
	if err != nil {
		fail(err)
	}
	if !markerMatches(root, appVersion) {
		if err := install(root, appVersion); err != nil {
			fail(err)
		}
	}
	if err := launch(filepath.Join(root, executableName+".exe")); err != nil {
		fail(err)
	}
}
