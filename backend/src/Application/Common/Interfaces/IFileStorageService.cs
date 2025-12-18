namespace Application.Common.Interfaces;

public interface IFileStorageService
{
    Task<string> SaveFileAsync(Guid entityId, string fileName, Stream content, CancellationToken ct = default);
    Task<Stream?> GetFileAsync(string path, CancellationToken ct = default);
    Task DeleteFileAsync(string path, CancellationToken ct = default);
    string GetFullPath(string relativePath);
}
