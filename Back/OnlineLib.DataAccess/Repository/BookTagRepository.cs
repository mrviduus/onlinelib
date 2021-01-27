using OnlineLib.DataAccess.Common;
using OnlineLib.Domain.Entities.Book;
using OnlineLib.Interfaces.Repository;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Repository
{
    internal class BookTagRepository : GenericRepository<BookTag, Guid>, IBookTagRepository
    {
        public BookTagRepository(ApplicationDatabaseContext context)
            : base(context)
        {
        }
    }
}
