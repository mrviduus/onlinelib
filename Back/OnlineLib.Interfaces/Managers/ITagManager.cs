using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

namespace OnlineLib.Interfaces.Managers
{
    public interface ITagManager
    {
        Task<IEnumerable<string>> GetPublicTags();
    }
}
