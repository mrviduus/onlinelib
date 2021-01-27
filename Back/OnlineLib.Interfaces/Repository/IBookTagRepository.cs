using OnlineLib.Domain.Entities.Book;
using OnlineLib.Interfaces.Common;
using System;
using System.Collections.Generic;
using System.Text;

namespace OnlineLib.Interfaces.Repository
{
    public interface IBookTagRepository : IGenericRepository<BookTag, Guid>
    {
    }
}
