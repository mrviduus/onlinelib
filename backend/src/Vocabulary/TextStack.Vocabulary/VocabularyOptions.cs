namespace TextStack.Vocabulary;

public class VocabularyOptions
{
    public string OllamaBaseUrl { get; set; } = "http://localhost:11434";
    public string OllamaModel { get; set; } = "qwen3:8b";
    public int OllamaTimeoutSeconds { get; set; } = 30;
}
