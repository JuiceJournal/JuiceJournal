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
        var classBuilder = new StringBuilder(256);

        var titleLength = GetWindowText(foregroundWindow, titleBuilder, titleBuilder.Capacity);
        var classLength = GetClassName(foregroundWindow, classBuilder, classBuilder.Capacity);
        var threadId = GetWindowThreadProcessId(foregroundWindow, out var processId);

        if (threadId == 0 || processId == 0)
        {
            return new Dictionary<string, object?>
            {
                ["hasForegroundWindow"] = false
            };
        }

        return new Dictionary<string, object?>
        {
            ["hasForegroundWindow"] = true,
            ["windowTitle"] = titleLength > 0 ? titleBuilder.ToString() : string.Empty,
            ["windowClass"] = classLength > 0 ? classBuilder.ToString() : string.Empty,
            ["processId"] = processId
        };
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder className, int maxCount);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
