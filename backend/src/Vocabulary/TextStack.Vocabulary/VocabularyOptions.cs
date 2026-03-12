namespace TextStack.Vocabulary;

public class VocabularyOptions
{
    public string OllamaBaseUrl { get; set; } = "http://localhost:11434";
    public string OllamaModel { get; set; } = "gemma3:4b";
    public int OllamaTimeoutSeconds { get; set; } = 30;
}
