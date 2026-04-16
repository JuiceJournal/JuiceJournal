using System.Text;

namespace JuiceJournal.NativeBridge.Services;

public sealed class MemoryTextIslandExtractor
{
    private const int MinimumLength = 5;
    private const int MaxIslands = 12;

    public IReadOnlyList<IReadOnlyDictionary<string, object?>> Extract(byte[] buffer)
    {
        var islands = new List<IReadOnlyDictionary<string, object?>>();
        islands.AddRange(ExtractAscii(buffer));
        islands.AddRange(ExtractUtf16(buffer));

        return islands
            .GroupBy(island => $"{island["encoding"]}:{island["text"]}", StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .Take(MaxIslands)
            .ToArray();
    }

    private static IEnumerable<IReadOnlyDictionary<string, object?>> ExtractAscii(byte[] buffer)
    {
        var current = new List<byte>();
        var start = 0;

        for (var index = 0; index < buffer.Length; index += 1)
        {
            var value = buffer[index];
            if (value >= 32 && value <= 126)
            {
                if (current.Count == 0)
                {
                    start = index;
                }

                current.Add(value);
                continue;
            }

            if (current.Count >= MinimumLength)
            {
                yield return new Dictionary<string, object?>
                {
                    ["offset"] = start,
                    ["encoding"] = "ascii",
                    ["text"] = Encoding.ASCII.GetString(current.ToArray())
                };
            }

            current.Clear();
        }

        if (current.Count >= MinimumLength)
        {
            yield return new Dictionary<string, object?>
            {
                ["offset"] = start,
                ["encoding"] = "ascii",
                ["text"] = Encoding.ASCII.GetString(current.ToArray())
            };
        }
    }

    private static IEnumerable<IReadOnlyDictionary<string, object?>> ExtractUtf16(byte[] buffer)
    {
        for (var index = 0; index + (MinimumLength * 2) <= buffer.Length; index += 2)
        {
            var chars = new List<char>();
            var offset = index;
            var cursor = index;

            while (cursor + 1 < buffer.Length)
            {
                var value = BitConverter.ToUInt16(buffer, cursor);
                if (value >= 32 && value <= 126)
                {
                    chars.Add((char)value);
                    cursor += 2;
                    continue;
                }

                break;
            }

            if (chars.Count >= MinimumLength)
            {
                yield return new Dictionary<string, object?>
                {
                    ["offset"] = offset,
                    ["encoding"] = "utf16le",
                    ["text"] = new string(chars.ToArray())
                };
            }
        }
    }
}
