using System.Runtime.InteropServices;
using System.Text;

namespace JuiceJournal.NativeBridge.Services;

public sealed class WindowProbe
{
    public IReadOnlyDictionary<string, object?> Capture()
    {
        var foregroundWindow = GetForegroundWindow();
        if (foregroundWindow == IntPtr.Zero)
        {
            return new Dictionary<string, object?>
            {
                ["hasForegroundWindow"] = false
            };
        }

        var titleBuilder = new StringBuilder(512);
        _ = GetWindowText(foregroundWindow, titleBuilder, titleBuilder.Capacity);

        var classBuilder = new StringBuilder(256);
        _ = GetClassName(foregroundWindow, classBuilder, classBuilder.Capacity);

        _ = GetWindowThreadProcessId(foregroundWindow, out var processId);

        return new Dictionary<string, object?>
        {
            ["hasForegroundWindow"] = true,
            ["windowTitle"] = titleBuilder.ToString(),
            ["windowClass"] = classBuilder.ToString(),
            ["processId"] = processId
        };
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
