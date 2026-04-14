using System.Diagnostics;

namespace JuiceJournal.NativeBridge.Services;

public sealed class TransitionProbe
{
    public IReadOnlyList<IReadOnlyDictionary<string, object?>> CaptureProcessSnapshots()
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

        return poeProcesses;
    }

    public IReadOnlyDictionary<string, object?> Capture()
    {
        return CreateTransitionProbeData(CaptureProcessSnapshots());
    }

    public static IReadOnlyDictionary<string, object?> CreateProcessProbeData(
        IReadOnlyList<IReadOnlyDictionary<string, object?>> processSnapshots)
    {
        var processEntries = processSnapshots
            .Select((snapshot) => new Dictionary<string, object?>
            {
                ["name"] = snapshot.TryGetValue("name", out var name) ? name : null,
                ["id"] = snapshot.TryGetValue("id", out var id) ? id : null
            })
            .Cast<IReadOnlyDictionary<string, object?>>()
            .ToArray();

        return new Dictionary<string, object?>
        {
            ["poeProcessCount"] = processEntries.Length,
            ["processes"] = processEntries
        };
    }

    public static IReadOnlyDictionary<string, object?> CreateTransitionProbeData(
        IReadOnlyList<IReadOnlyDictionary<string, object?>> processSnapshots)
    {
        return new Dictionary<string, object?>
        {
            ["processes"] = processSnapshots
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
