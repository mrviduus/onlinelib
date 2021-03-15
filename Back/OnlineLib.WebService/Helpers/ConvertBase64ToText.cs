using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace OnlineLib.WebService.Helpers
{
    public static class ConvertBase64ToText
    {
        public static string Decode(string encodedString)
        {
            try
            {
                var matchGroups = Regex.Match(encodedString, @"data:text/(?<type>.+?),(?<data>.+)").Groups;
                var data = Convert.FromBase64String(matchGroups["data"].Value);

                return Encoding.UTF8.GetString(data);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message, ex.StackTrace);
                throw;
            }
        }
    }
}
