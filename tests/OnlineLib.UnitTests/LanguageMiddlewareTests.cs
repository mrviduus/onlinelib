using Api.Language;
using Api.Sites;
using Microsoft.AspNetCore.Http;

namespace OnlineLib.UnitTests;

public class LanguageMiddlewareTests
{
    [Theory]
    [InlineData("/uk/books", "uk", LanguageSource.UrlPath)]
    [InlineData("/en/books", "en", LanguageSource.UrlPath)]
    [InlineData("/UK/books", "uk", LanguageSource.UrlPath)]
    [InlineData("/EN/books", "en", LanguageSource.UrlPath)]
    [InlineData("/uk/books/kobzar", "uk", LanguageSource.UrlPath)]
    [InlineData("/en/books/hamlet/chapters/1", "en", LanguageSource.UrlPath)]
    public async Task ExtractsLanguageFromUrl_AndRewritesPath(string path, string expectedLang, LanguageSource expectedSource)
    {
        // Arrange
        var context = CreateContext(path);
        var middleware = new LanguageMiddleware(_ => Task.CompletedTask);

        // Act
        await middleware.InvokeAsync(context);

        // Assert
        var langCtx = context.Items["LanguageContext"] as LanguageContext;
        Assert.NotNull(langCtx);
        Assert.Equal(expectedLang, langCtx.Language);
        Assert.Equal(expectedSource, langCtx.Source);
    }

    [Fact]
    public async Task FallsBackToAcceptLanguage_WhenNoUrlPrefix()
    {
        var context = CreateContext("/books");
        context.Request.Headers.AcceptLanguage = "uk-UA,uk;q=0.9,en;q=0.8";
        var middleware = new LanguageMiddleware(_ => Task.CompletedTask);

        await middleware.InvokeAsync(context);

        var langCtx = context.Items["LanguageContext"] as LanguageContext;
        Assert.NotNull(langCtx);
        Assert.Equal("uk", langCtx.Language);
        Assert.Equal(LanguageSource.AcceptLanguage, langCtx.Source);
    }

    [Fact]
    public async Task FallsBackToSiteDefault_WhenNoUrlAndNoAcceptLang()
    {
        var context = CreateContext("/books");
        context.Items["SiteContext"] = new SiteContext(
            Guid.NewGuid(), "general", "general.localhost", "en", "default", false, true, true, "{}");
        var middleware = new LanguageMiddleware(_ => Task.CompletedTask);

        await middleware.InvokeAsync(context);

        var langCtx = context.Items["LanguageContext"] as LanguageContext;
        Assert.NotNull(langCtx);
        Assert.Equal("en", langCtx.Language);
        Assert.Equal(LanguageSource.SiteDefault, langCtx.Source);
    }

    [Theory]
    [InlineData("/admin/sites")]
    [InlineData("/health")]
    [InlineData("/openapi")]
    [InlineData("/debug/info")]
    [InlineData("/site/context")]
    public async Task SkipsPaths_DoNotSetLanguageContext(string path)
    {
        var context = CreateContext(path);
        var middleware = new LanguageMiddleware(_ => Task.CompletedTask);

        await middleware.InvokeAsync(context);

        Assert.Null(context.Items["LanguageContext"]);
    }

    [Fact]
    public async Task RewritesPath_RemovesLanguagePrefix()
    {
        var context = CreateContext("/uk/books/kobzar");
        string? capturedPath = null;
        var middleware = new LanguageMiddleware(ctx =>
        {
            capturedPath = ctx.Request.Path.Value;
            return Task.CompletedTask;
        });

        await middleware.InvokeAsync(context);

        Assert.Equal("/books/kobzar", capturedPath);
    }

    [Fact]
    public async Task ParsesAcceptLanguage_WithQualityValues()
    {
        var context = CreateContext("/books");
        context.Request.Headers.AcceptLanguage = "de,uk;q=0.8,en;q=0.7";
        var middleware = new LanguageMiddleware(_ => Task.CompletedTask);

        await middleware.InvokeAsync(context);

        var langCtx = context.Items["LanguageContext"] as LanguageContext;
        Assert.NotNull(langCtx);
        // "de" is first but not supported, so falls through to "uk"
        Assert.Equal("uk", langCtx.Language);
    }

    [Fact]
    public async Task DefaultsToUk_WhenNoSiteContext()
    {
        var context = CreateContext("/books");
        var middleware = new LanguageMiddleware(_ => Task.CompletedTask);

        await middleware.InvokeAsync(context);

        var langCtx = context.Items["LanguageContext"] as LanguageContext;
        Assert.NotNull(langCtx);
        Assert.Equal("uk", langCtx.Language);
        Assert.Equal(LanguageSource.SiteDefault, langCtx.Source);
    }

    private static HttpContext CreateContext(string path)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.Request.Host = new HostString("general.localhost");
        return context;
    }
}
