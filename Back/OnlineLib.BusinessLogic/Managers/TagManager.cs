using OnlineLib.Interfaces.Common;
using OnlineLib.Interfaces.Managers;
using OnlineLib.Models.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace OnlineLib.BusinessLogic.Managers
{
    public class TagManager : ITagManager
    {
        private readonly IUnitOfWork Uow;

        public TagManager(IUnitOfWork Uow) => this.Uow = Uow;

        public async Task<IEnumerable<string>> GetPublicTags()
        {
            return this.Uow.TagRepository.Get(x => x.TagType == TagType.Public).Select(x => x.Name);
        }
    }
}
