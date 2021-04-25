using Microsoft.Extensions.Configuration;
using OnlineLib.Domain.DTO;
using System;
using System.IO;
using System.Text.RegularExpressions;

namespace OnlineLib.WebService.Helpers
{
    public static class SaveImageToServerFolder
    {
        private static string frontPath = Startup.StaticConfig.GetValue<string>(Constants.FrontPath);
        private static string imagesFolder = Startup.StaticConfig.GetValue<string>(Constants.ImagesFolder);

        public static string Save(Base64ImgFile base64ImgFile)
        {
            try
            {
                var fileName = base64ImgFile.FileName;
                var fileBase64 = base64ImgFile.Base64Code;
                var imgFolder = base64ImgFile.FolderName;

                var matchGroups = Regex.Match(fileBase64, @"data:image/(?<type>.+?),(?<data>.+)").Groups;
                var base64Data = matchGroups["data"].Value;
                var binData = Convert.FromBase64String(base64Data);
                var folderName = Path.Combine(imagesFolder, imgFolder);
                System.IO.Directory.CreateDirectory(frontPath + folderName);
                var pathToSave = Path.Combine(frontPath, folderName, fileName);
                System.IO.File.WriteAllBytes(pathToSave, binData);

                var dbPath = Path.Combine(folderName, fileName);

                return dbPath;
            }
            catch (Exception ex)
            {
                throw;
            }
        }
    }
}
