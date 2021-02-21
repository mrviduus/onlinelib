using OnlineLib.Interfaces.Common;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

namespace OnlineLib.Interfaces.Repository
{
    public interface ITagRepository : IGenericRepository<Tag, Guid>
    {
        public Tag TagsWithNameAndType(string tag, TagType tagType);

        public List<string> TagsWithIds(List<Guid> ids);
    }
}
