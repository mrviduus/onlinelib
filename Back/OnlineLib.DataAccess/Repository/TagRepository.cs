using OnlineLib.DataAccess.Common;
using OnlineLib.Interfaces.Repository;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Repository
{
    internal class TagRepository : GenericRepository<Tag, Guid>, ITagRepository
    {
        public TagRepository(ApplicationDatabaseContext context)
            : base(context)
        {
        }

        public List<string> TagsWithArticleId(List<Guid> ids)
        {
            var tags = this.context.Tag.ToList();

            return tags.Where(x => ids.Contains(x.Id)).Select(x => x.Name).ToList();
        }

        public Tag TagsWithNameAndType(string tag, TagType tagType)
        {
            return this.context.Tag.Where(entity => entity.Name == tag && entity.TagType == tagType).FirstOrDefault();
        }
    }
}
