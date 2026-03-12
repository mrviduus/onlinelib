namespace TextStack.Vocabulary;

public static class SentenceHelper
{
    public static string ReplaceWordInSentence(string sentence, string word)
    {
        var idx = sentence.IndexOf(word, StringComparison.OrdinalIgnoreCase);
        if (idx >= 0)
            return string.Concat(sentence.AsSpan(0, idx), "___", sentence.AsSpan(idx + word.Length));
        return sentence + " [___]";
    }
}
