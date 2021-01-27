using OnlineLib.DataAccess.Common;
using OnlineLib.Domain.Entities.Book;
using OnlineLib.Interfaces.Repository;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineLib.DataAccess.Repository
{
    internal class AuthorRepository : GenericRepository<Author, Guid>, IAuthorRepository
    {
        public AuthorRepository(ApplicationDatabaseContext context)
            : base(context)
        {
        }
    }
}
