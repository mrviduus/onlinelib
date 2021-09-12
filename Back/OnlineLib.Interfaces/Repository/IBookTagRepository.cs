using System;
using OnlineLib.Domain.Entities.Book;
using OnlineLib.Interfaces.Common;

namespace OnlineLib.Interfaces.Repository
{
    public interface IBookTagRepository : IGenericRepository<BookTag, Guid>
    {
    }
}
