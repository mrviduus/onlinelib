using OnlineLib.Domain.DTO.Book;
using System;

namespace OnlineLib.Interfaces.Managers.Admin
{
    public interface IBookManager : IAdminManagerRepository<BookDTO, Guid>
    {
    }
}
