using System.Text.Json.Serialization;

namespace SahamLens.Domain;

public sealed record Candle(
    [property: JsonPropertyName("time")] string Time,
    [property: JsonPropertyName("open")] decimal Open,
    [property: JsonPropertyName("high")] decimal High,
    [property: JsonPropertyName("low")] decimal Low,
    [property: JsonPropertyName("close")] decimal Close,
    [property: JsonPropertyName("volume")] long Volume);

public sealed record ScreenerStock
{
    [JsonPropertyName("ticker")] public string Ticker { get; init; } = "";
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    [JsonPropertyName("sector")] public string? Sector { get; init; }
    [JsonPropertyName("entry")] public decimal? Entry { get; init; }
    [JsonPropertyName("signal")] public string? Signal { get; init; }
    [JsonPropertyName("per")] public decimal? Per { get; init; }
    [JsonPropertyName("pbv")] public decimal? Pbv { get; init; }
    [JsonPropertyName("atr_pct")] public decimal? AtrPercent { get; init; }
}

public sealed record ScreenerAnalysis
{
    [JsonPropertyName("top_10_stocks")] public IReadOnlyList<ScreenerStock> Stocks { get; init; } = [];
    [JsonPropertyName("total_count")] public int TotalCount { get; init; }
    [JsonPropertyName("locked_count")] public int LockedCount { get; init; }
    [JsonPropertyName("is_guest_limited")] public bool IsGuestLimited { get; init; }
}
public sealed record ScreenerResult
{
    [JsonPropertyName("profile")] public string Profile { get; init; } = "Moderat";
    [JsonPropertyName("analysis")] public ScreenerAnalysis Analysis { get; init; } = new();
    [JsonPropertyName("availableSectors")] public IReadOnlyList<string> AvailableSectors { get; init; } = [];
}
public sealed record ChartResult
{
    [JsonPropertyName("ticker")] public string Ticker { get; init; } = "";
    [JsonPropertyName("history")] public IReadOnlyList<Candle> History { get; init; } = [];
}
public sealed record NewsResult
{
    [JsonPropertyName("items")] public IReadOnlyList<NewsItem> Items { get; init; } = [];
    [JsonPropertyName("sentimentSource")] public string SentimentSource { get; init; } = "";
}

public sealed record NewsItem
{
    [JsonPropertyName("title")] public string Title { get; init; } = "";
    [JsonPropertyName("source")] public string Source { get; init; } = "";
    [JsonPropertyName("pubDate")] public string PublishedAt { get; init; } = "";
    [JsonPropertyName("sentiment")] public string? Sentiment { get; init; }
    [JsonPropertyName("summary")] public string? Summary { get; init; }
}

public sealed record IndicatorDefinition(string Id, string Label, int DefaultPeriod, string Pane);

public static class TechnicalIndicators
{
    public static readonly IReadOnlyList<IndicatorDefinition> All =
    [
        new("ema20", "EMA 20", 20, "price"), new("ema50", "EMA 50", 50, "price"), new("ema200", "EMA 200", 200, "price"),
        new("bollinger", "Bollinger (20,2)", 20, "price"), new("volume", "Volume", 1, "volume"), new("rsi", "RSI 14", 14, "oscillator"),
        new("macd", "MACD", 26, "oscillator"), new("obv", "OBV", 1, "oscillator"), new("atr", "ATR 14", 14, "oscillator"),
        new("stochastic", "Stochastic", 14, "oscillator"), new("adx", "ADX 14", 14, "oscillator"), new("cmf", "CMF 20", 20, "oscillator"),
        new("williams", "Williams %R", 14, "oscillator")
    ];
}
