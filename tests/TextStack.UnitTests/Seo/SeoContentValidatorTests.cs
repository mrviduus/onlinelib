using System.Text.Json;
using Application.Seo;

namespace TextStack.UnitTests.Seo;

public class SeoContentValidatorTests
{
    private static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement;

    [Fact]
    public void Validate_ValidObject_Ok()
    {
        var schema = """{"type":"object","required":["bio"],"properties":{"bio":{"type":"string","minLength":5,"maxLength":100}}}""";
        var value = Parse("""{"bio":"A short author biography."}""");
        var result = SeoContentValidator.Validate(value, schema);
        Assert.True(result.IsValid);
        Assert.Empty(result.Errors);
    }

    [Fact]
    public void Validate_MissingRequired_Fails()
    {
        var schema = """{"type":"object","required":["bio"],"properties":{"bio":{"type":"string"}}}""";
        var value = Parse("""{"other":"x"}""");
        var result = SeoContentValidator.Validate(value, schema);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Contains("missing required"));
    }

    [Fact]
    public void Validate_WrongType_Fails()
    {
        var schema = """{"type":"object","properties":{"bio":{"type":"string"}}}""";
        var value = Parse("""{"bio":123}""");
        var result = SeoContentValidator.Validate(value, schema);
        Assert.False(result.IsValid);
    }

    [Fact]
    public void Validate_StringTooShort_Fails()
    {
        var schema = """{"type":"object","properties":{"bio":{"type":"string","minLength":10}}}""";
        var value = Parse("""{"bio":"hi"}""");
        var result = SeoContentValidator.Validate(value, schema);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Contains("too short"));
    }

    [Fact]
    public void Validate_StringTooLong_Fails()
    {
        var schema = """{"type":"object","properties":{"bio":{"type":"string","maxLength":3}}}""";
        var value = Parse("""{"bio":"overlong"}""");
        var result = SeoContentValidator.Validate(value, schema);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Contains("too long"));
    }

    [Fact]
    public void Validate_ArrayItems_ValidatesEach()
    {
        var schema = """{"type":"object","properties":{"themes":{"type":"array","minItems":2,"items":{"type":"string","minLength":3}}}}""";
        var okValue = Parse("""{"themes":["abc","def"]}""");
        Assert.True(SeoContentValidator.Validate(okValue, schema).IsValid);

        var shortItem = Parse("""{"themes":["ab","def"]}""");
        var r = SeoContentValidator.Validate(shortItem, schema);
        Assert.False(r.IsValid);
        Assert.Contains(r.Errors, e => e.Contains("themes[0]"));
    }

    [Fact]
    public void Validate_ArrayTooFew_Fails()
    {
        var schema = """{"type":"object","properties":{"themes":{"type":"array","minItems":5,"items":{"type":"string"}}}}""";
        var value = Parse("""{"themes":["a","b"]}""");
        var result = SeoContentValidator.Validate(value, schema);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Contains("at least 5"));
    }

    [Fact]
    public void Validate_ArrayTooMany_Fails()
    {
        var schema = """{"type":"object","properties":{"themes":{"type":"array","maxItems":2,"items":{"type":"string"}}}}""";
        var value = Parse("""{"themes":["a","b","c"]}""");
        var result = SeoContentValidator.Validate(value, schema);
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Contains("at most 2"));
    }

    [Fact]
    public void Validate_InvalidSchemaJson_Fails()
    {
        var value = Parse("""{"x":1}""");
        var result = SeoContentValidator.Validate(value, "{not json");
        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, e => e.Contains("Schema is not valid JSON"));
    }

    [Fact]
    public void Validate_IntegerType_Ok()
    {
        var schema = """{"type":"object","properties":{"year":{"type":"integer"}}}""";
        Assert.True(SeoContentValidator.Validate(Parse("""{"year":1984}"""), schema).IsValid);
        Assert.False(SeoContentValidator.Validate(Parse("""{"year":"1984"}"""), schema).IsValid);
    }

    [Fact]
    public void Validate_BooleanType_Ok()
    {
        var schema = """{"type":"object","properties":{"active":{"type":"boolean"}}}""";
        Assert.True(SeoContentValidator.Validate(Parse("""{"active":true}"""), schema).IsValid);
        Assert.False(SeoContentValidator.Validate(Parse("""{"active":"yes"}"""), schema).IsValid);
    }

    [Fact]
    public void Validate_NestedObject_Ok()
    {
        var schema = """{"type":"object","properties":{"meta":{"type":"object","required":["lang"],"properties":{"lang":{"type":"string"}}}}}""";
        Assert.True(SeoContentValidator.Validate(Parse("""{"meta":{"lang":"en"}}"""), schema).IsValid);

        var bad = SeoContentValidator.Validate(Parse("""{"meta":{}}"""), schema);
        Assert.False(bad.IsValid);
        Assert.Contains(bad.Errors, e => e.Contains("meta") && e.Contains("lang"));
    }
}
