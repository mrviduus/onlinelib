namespace TextStack.Search.Meilisearch;

public sealed class MeilisearchOptions
{
    public string Url { get; set; } = "http://localhost:7700";
    public string? MasterKey { get; set; }
    public string IndexPrefix { get; set; } = "textstack";
}
