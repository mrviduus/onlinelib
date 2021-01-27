using OnlineLib.DataAccess.Common;
using OnlineLib.Domain.Entities.Book;
using OnlineLib.Interfaces.Repository;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Repository
{
    internal class BookRepository : GenericRepository<Book, Guid>, IBookRepository
    {
        public BookRepository(ApplicationDatabaseContext context)
            : base(context)
        {
        }
    }
}
