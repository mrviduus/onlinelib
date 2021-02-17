using Microsoft.Extensions.Configuration;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Helpers
{
    public static class SaveImageToServerFolder
    {
        private static string frontPath = Startup.StaticConfig.GetValue<string>(Constants.FrontPath);
        private static string imagesFolder = Startup.StaticConfig.GetValue<string>(Constants.ImagesFolder);

        /// <summary>
        /// Parse and save image in server folder.
        /// </summary>
        /// <param name="imgFolder">Folder name</param>
        /// <param name="fileNameAndData">Json with data.</param>
        /// <returns>String with path.</returns>
        public static string Save(string imgFolder, string fileNameAndData)
        {
            try
            {
                var json = JObject.Parse(fileNameAndData);
                var fileName = (string)json["fileName"];
                var fileBase64 = (string)json["fileBase64"];

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
            catch (JsonReaderException jex)
            {
                return fileNameAndData;
            }
            catch (Exception ex)
            {
                throw;
            }

        }
    }
}
