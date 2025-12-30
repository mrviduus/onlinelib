using System.Diagnostics;

namespace OnlineLib.Extraction.Ocr;

/// <summary>
/// CLI-based Tesseract OCR engine. Uses tesseract command line tool.
/// Works on Linux/macOS where Tesseract is installed via package manager.
/// </summary>
public sealed class TesseractCliOcrEngine : IOcrEngine
{
    private readonly string _tessDataPath;

    public TesseractCliOcrEngine(string? tessDataPath = null)
    {
        _tessDataPath = tessDataPath ?? "/usr/share/tesseract-ocr/5/tessdata";
    }

    public async Task<OcrPageResult> RecognizeAsync(Stream image, string language, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(image);
        language ??= "eng";

        // Save image to temp file (use .pnm extension for PNM format from DJVU)
        var tempImagePath = Path.GetTempFileName() + ".pnm";
        var tempOutputPath = Path.GetTempFileName();

        try
        {
            // Write image stream to temp file
            await using (var fs = File.Create(tempImagePath))
            {
                await image.CopyToAsync(fs, ct);
            }

            // Run tesseract CLI: tesseract input.png output -l eng
            // Tesseract appends .txt to output path
            var outputBasePath = tempOutputPath;

            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "tesseract",
                    Arguments = $"\"{tempImagePath}\" \"{outputBasePath}\" -l {language}",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    Environment =
                    {
                        ["TESSDATA_PREFIX"] = _tessDataPath
                    }
                }
            };

            process.Start();

            var stderr = await process.StandardError.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct);

            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException($"Tesseract failed: {stderr}");
            }

            // Read output (tesseract adds .txt extension)
            var outputPath = outputBasePath + ".txt";
            if (!File.Exists(outputPath))
            {
                return new OcrPageResult(string.Empty, 0);
            }

            var text = await File.ReadAllTextAsync(outputPath, ct);

            // Clean up output file
            try { File.Delete(outputPath); } catch { /* ignore */ }

            return new OcrPageResult(text.Trim(), 0.0); // CLI doesn't give confidence
        }
        finally
        {
            // Clean up temp files
            try { File.Delete(tempImagePath); } catch { /* ignore */ }
            try { File.Delete(tempOutputPath); } catch { /* ignore */ }
        }
    }
}
