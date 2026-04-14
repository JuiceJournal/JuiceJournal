using System.Diagnostics;

namespace JuiceJournal.NativeBridge.Services;

public sealed class TransitionProbe
{
    public IReadOnlyDictionary<string, object?> Capture()
    {
        var poeProcesses = new List<IReadOnlyDictionary<string, object?>>();

        foreach (var process in Process.GetProcesses())
        {
            try
            {
                var processName = process.ProcessName;
                if (!processName.Contains("PathOfExile", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                poeProcesses.Add(new Dictionary<string, object?>
                {
                    ["name"] = processName,
                    ["id"] = process.Id,
                    ["startTimeUtc"] = TryGetStartTime(process)
                });
            }
            catch (InvalidOperationException)
            {
                // Process exited during enumeration.
            }
            catch (SystemException)
            {
                // Process metadata is not accessible in the current context.
            }
        }

        return new Dictionary<string, object?>
        {
            ["processes"] = poeProcesses
        };
    }

    private static DateTimeOffset? TryGetStartTime(Process process)
    {
        try
        {
            return process.StartTime.ToUniversalTime();
        }
        catch (InvalidOperationException)
        {
            return null;
        }
        catch (SystemException)
        {
            return null;
        }
    }
}
