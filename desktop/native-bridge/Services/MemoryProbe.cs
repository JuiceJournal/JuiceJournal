using System.Runtime.InteropServices;

namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryProbe
{
    private const uint ProcessQueryInformation = 0x0400;
    private const uint ProcessVmRead = 0x0010;

    private const uint MemCommit = 0x1000;
    private const uint MemPrivate = 0x20000;
    private const uint PageNoAccess = 0x01;
    private const uint PageGuard = 0x100;

    public sealed record MemoryRegion(
        nuint BaseAddress,
        nuint Size,
        string State,
        string Protect,
        string Type);

    private readonly Func<int, IReadOnlyList<MemoryRegion>> regionProvider;
    private readonly Func<int, MemoryRegion, int, byte[]> readProvider;

    public MemoryProbe(
        Func<int, IReadOnlyList<MemoryRegion>>? regionProvider = null,
        Func<int, MemoryRegion, int, byte[]>? readProvider = null)
    {
        this.regionProvider = regionProvider ?? EnumerateReadableRegions;
        this.readProvider = readProvider ?? ReadRegionBytes;
    }

    public IReadOnlyList<MemoryRegion> CaptureReadableRegions(int processId, nuint maxTotalBytes = 1024 * 1024)
    {
        nuint totalBytes = 0;
        var accepted = new List<MemoryRegion>();

        foreach (var region in regionProvider(processId))
        {
            if (!string.Equals(region.State, "MEM_COMMIT", StringComparison.Ordinal)
                || !string.Equals(region.Type, "MEM_PRIVATE", StringComparison.Ordinal)
                || region.Protect.Contains("NOACCESS", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (totalBytes + region.Size > maxTotalBytes)
            {
                break;
            }

            accepted.Add(region);
            totalBytes += region.Size;
        }

        return accepted;
    }

    public byte[] ReadRegion(int processId, MemoryRegion region, int maxBytesPerRegion = 65536)
    {
        var bytesToRead = (int)Math.Min((nuint)maxBytesPerRegion, region.Size);
        if (bytesToRead <= 0)
        {
            return [];
        }

        return readProvider(processId, region, bytesToRead);
    }

    private static IReadOnlyList<MemoryRegion> EnumerateReadableRegions(int processId)
    {
        var handle = OpenProcess(ProcessQueryInformation | ProcessVmRead, false, processId);
        if (handle == IntPtr.Zero)
        {
            return [];
        }

        try
        {
            var regions = new List<MemoryRegion>();
            ulong address = 0;
            var infoSize = (uint)Marshal.SizeOf<MemoryBasicInformation64>();

            while (VirtualQueryEx(handle, address, out var info, infoSize) != 0)
            {
                var state = info.State;
                var protect = info.Protect;
                var type = info.Type;

                regions.Add(new MemoryRegion(
                    BaseAddress: (nuint)info.BaseAddress,
                    Size: (nuint)info.RegionSize,
                    State: state == MemCommit ? "MEM_COMMIT" : state.ToString("X"),
                    Protect: FormatProtect(protect),
                    Type: type == MemPrivate ? "MEM_PRIVATE" : type.ToString("X")));

                var nextAddress = info.BaseAddress + info.RegionSize;
                if (nextAddress <= address)
                {
                    break;
                }

                address = nextAddress;
            }

            return regions;
        }
        finally
        {
            CloseHandle(handle);
        }
    }

    private static byte[] ReadRegionBytes(int processId, MemoryRegion region, int bytesToRead)
    {
        var handle = OpenProcess(ProcessQueryInformation | ProcessVmRead, false, processId);
        if (handle == IntPtr.Zero)
        {
            return [];
        }

        try
        {
            var buffer = new byte[bytesToRead];
            if (!ReadProcessMemory(handle, region.BaseAddress, buffer, bytesToRead, out var bytesRead)
                || bytesRead == 0)
            {
                return [];
            }

            if ((int)bytesRead == buffer.Length)
            {
                return buffer;
            }

            return buffer.Take((int)bytesRead).ToArray();
        }
        finally
        {
            CloseHandle(handle);
        }
    }

    private static string FormatProtect(uint protect)
    {
        if ((protect & PageNoAccess) == PageNoAccess)
        {
            return "PAGE_NOACCESS";
        }

        if ((protect & PageGuard) == PageGuard)
        {
            return "PAGE_GUARD";
        }

        return "PAGE_READWRITE";
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryBasicInformation64
    {
        public ulong BaseAddress;
        public ulong AllocationBase;
        public uint AllocationProtect;
        public uint Alignment1;
        public ulong RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
        public uint Alignment2;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint processAccess, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int VirtualQueryEx(
        IntPtr processHandle,
        ulong address,
        out MemoryBasicInformation64 buffer,
        uint length);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadProcessMemory(
        IntPtr processHandle,
        nuint baseAddress,
        [Out] byte[] buffer,
        int size,
        out nuint bytesRead);
}
