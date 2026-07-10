using OpenAI.Chat;
using TextStack.Ai.Core;
using TextStack.Ai.Llm;

namespace TextStack.UnitTests;

/// <summary>
/// ADR-012 S3 multimodal seam: a user <see cref="LlmMessage"/> carrying <see cref="LlmImage"/>s must
/// produce a <see cref="UserChatMessage"/> with an image content part (bytes + media type). Text-only
/// messages must stay a single text part — the seam is additive, the text path is unchanged.
/// </summary>
public class OpenAiLlmClientMultimodalTests
{
    private static LlmRequest Request(LlmMessage message) =>
        new("system prompt", [message], MaxOutputTokens: 100, FeatureTag: "pdf.parse");

    [Fact]
    public void BuildMessages_UserMessageWithImage_BuildsImagePart()
    {
        var jpeg = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3 };
        var request = Request(new LlmMessage(
            "user", "Transcribe this page.", Images: [new LlmImage(jpeg, "image/jpeg")]));

        var messages = OpenAiLlmClient.BuildMessages(request);

        var user = Assert.IsType<UserChatMessage>(messages[^1]);
        // Text prompt first, then the image part.
        Assert.Contains(user.Content, p => p.Kind == ChatMessageContentPartKind.Text);
        var imagePart = Assert.Single(user.Content, p => p.Kind == ChatMessageContentPartKind.Image);
        Assert.Equal("image/jpeg", imagePart.ImageBytesMediaType);
        Assert.Equal(jpeg, imagePart.ImageBytes.ToArray());
    }

    [Fact]
    public void BuildMessages_MultipleImages_BuildsOnePartEach()
    {
        var request = Request(new LlmMessage(
            "user", "prompt",
            Images: [new LlmImage([1, 2], "image/jpeg"), new LlmImage([3, 4], "image/png")]));

        var user = Assert.IsType<UserChatMessage>(OpenAiLlmClient.BuildMessages(request)[^1]);

        Assert.Equal(2, user.Content.Count(p => p.Kind == ChatMessageContentPartKind.Image));
    }

    [Fact]
    public void BuildMessages_TextOnlyUserMessage_HasNoImagePart()
    {
        var request = Request(new LlmMessage("user", "just text"));

        var user = Assert.IsType<UserChatMessage>(OpenAiLlmClient.BuildMessages(request)[^1]);

        Assert.DoesNotContain(user.Content, p => p.Kind == ChatMessageContentPartKind.Image);
        Assert.Contains(user.Content, p => p.Kind == ChatMessageContentPartKind.Text);
    }

    [Fact]
    public void BuildMessages_SystemPromptFirst()
    {
        var request = Request(new LlmMessage("user", "hi"));

        Assert.IsType<SystemChatMessage>(OpenAiLlmClient.BuildMessages(request)[0]);
    }
}
