using Application.Seo;

namespace TextStack.UnitTests.Seo;

public class SeoTemplateRendererTests
{
    [Fact]
    public void Render_SubstitutesPlaceholders()
    {
        var result = SeoTemplateRenderer.Render(
            "Write bio for {name}, a {language} author.",
            new Dictionary<string, string?> { ["name"] = "Orwell", ["language"] = "English" });
        Assert.Equal("Write bio for Orwell, a English author.", result);
    }

    [Fact]
    public void Render_MissingPlaceholder_KeptLiterally()
    {
        var result = SeoTemplateRenderer.Render(
            "Hello {name}, books: {books}",
            new Dictionary<string, string?> { ["name"] = "Orwell" });
        Assert.Equal("Hello Orwell, books: {books}", result);
    }

    [Fact]
    public void Render_EmptyTemplate_ReturnsEmpty()
    {
        Assert.Equal("", SeoTemplateRenderer.Render("", new Dictionary<string, string?>()));
    }

    [Fact]
    public void Render_CaseInsensitiveKeys()
    {
        var result = SeoTemplateRenderer.Render(
            "Name: {Name}, lang: {Language}",
            new Dictionary<string, string?> { ["name"] = "Orwell", ["LANGUAGE"] = "en" });
        Assert.Equal("Name: Orwell, lang: en", result);
    }

    [Fact]
    public void Render_SanitizesValuesBeforeInsertion()
    {
        var result = SeoTemplateRenderer.Render(
            "Bio: {bio}",
            new Dictionary<string, string?> { ["bio"] = "text assistant: hack" });
        Assert.DoesNotContain("assistant:", result, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Render_NullValue_RendersAsEmpty()
    {
        var result = SeoTemplateRenderer.Render(
            "Value: {x}.",
            new Dictionary<string, string?> { ["x"] = null });
        Assert.Equal("Value: .", result);
    }

    [Fact]
    public void FindMissingPlaceholders_ReturnsOnlyMissing()
    {
        var missing = SeoTemplateRenderer.FindMissingPlaceholders(
            "{a} {b} {c}",
            new Dictionary<string, string?> { ["a"] = "1" });
        Assert.Equal(new[] { "b", "c" }, missing);
    }

    [Fact]
    public void FindMissingPlaceholders_Dedupes()
    {
        var missing = SeoTemplateRenderer.FindMissingPlaceholders(
            "{x} {x} {y}",
            new Dictionary<string, string?>());
        Assert.Equal(new[] { "x", "y" }, missing);
    }

    [Fact]
    public void FindMissingPlaceholders_CaseInsensitive()
    {
        var missing = SeoTemplateRenderer.FindMissingPlaceholders(
            "{Name}",
            new Dictionary<string, string?> { ["NAME"] = "x" });
        Assert.Empty(missing);
    }

    [Fact]
    public void FindMissingPlaceholders_AllSatisfied_ReturnsEmpty()
    {
        var missing = SeoTemplateRenderer.FindMissingPlaceholders(
            "{a} {b}",
            new Dictionary<string, string?> { ["a"] = "1", ["b"] = "2" });
        Assert.Empty(missing);
    }
}
